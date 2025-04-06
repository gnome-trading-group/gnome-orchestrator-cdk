import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { AMIS, OrchestratorConfig, CollectorInstance } from "../config";
import { MonitoringStack } from "./monitoring-stack";
import { OrchestratorLambda } from "../constructs/lambda";

export interface CollectorStackProps extends cdk.StackProps {
  config: OrchestratorConfig;
  monitoringStack: MonitoringStack;
}

export class CollectorStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: CollectorStackProps) {
    super(scope, id, props);

    const rawBucket = new s3.Bucket(this, 'CollectorRawBucket', {
      bucketName: `market-data-raw-${props.config.account.stage}`,
    });
    const finalBucket = new s3.Bucket(this, 'CollectorFinalBucket', {
      bucketName: `market-data-consolidated-${props.config.account.stage}`,
    });

    const vpc = new ec2.Vpc(this, 'CollectorVPC', {
      maxAzs: 2,
      natGateways: 0, // Avoid NAT Gateway costs
      subnetConfiguration: [
        {
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const logGroup = new logs.LogGroup(this, 'CollectorLogGroup', {
      logGroupName: '/collector/logs',
      retention: logs.RetentionDays.ONE_WEEK,
    });
    this.buildMonitoring(logGroup, props.monitoringStack);

    const securityGroup = new ec2.SecurityGroup(this, 'CollectorSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access any IP'
    );

    const role = new iam.Role(this, 'CollectorRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
    );
    rawBucket.grantReadWrite(role);

    const githubSecret = secretsmanager.Secret.fromSecretNameV2(this, 'GithubMaven', 'GITHUB_MAVEN');
    githubSecret.grantRead(role);

    // TODO: Only have a keypair on dev
    const keyPair = ec2.KeyPair.fromKeyPairName(this, 'DefaultKeyPair', 'DefaultKeyPair');

    for (const item of props.config.collectors) {
      this.createEC2Instance(item, vpc, securityGroup, role, rawBucket, githubSecret, props.config.collectorOrchestratorVersion, props.config.allowCollectorSSH ? keyPair : undefined);
    }

    const aggregatorLambda = new OrchestratorLambda(this, 'CollectorAggregatorLambda', {
      orchestratorVersion: props.config.collectorOrchestratorVersion,
      classPath: 'group.gnometrading.collectors.AggregatorOrchestrator',
      lambdaName: 'CollectorAggregatorLambda',
      region: props.config.account.region,
    });

    // TODO: Run the aggregator lambda every 6 hours -- or until i have more money to afford more lambdas
  }

  private buildMonitoring(
    logGroup: logs.LogGroup,
    monitoringStack: MonitoringStack,
  ) {
    const filter = logGroup.addMetricFilter('ErrorMetricFilter', {
      filterPattern: logs.FilterPattern.anyTerm('Exception', 'ERROR'),
      metricName: 'ErrorCount',
      metricNamespace: 'CollectorLogs',
    });

    const metric = filter.metric({
      statistic: 'sum',
      period: cdk.Duration.minutes(1),
    });

    const alarm = new cw.Alarm(this, 'CollectorErrorAlarm', {
      metric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Triggers when there are errors in any collector log streams',
    });

    monitoringStack.subscribeSlackAlarm(alarm);
    monitoringStack.dashboard.addWidgets(new cw.GraphWidget({
      title: "Collector Log Errors",
      width: 12,
      left: [
        metric,
      ],
      leftAnnotations: [
        alarm.toAnnotation(),
      ],
    }));
 }

  private createEC2Instance(
    item: CollectorInstance,
    vpc: ec2.Vpc,
    securityGroup: ec2.SecurityGroup,
    role: iam.Role,
    bucket: s3.Bucket,
    githubSecret: secretsmanager.ISecret,
    orchestratorVersion: string,
    keyPair?: ec2.IKeyPair,
  ) {
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
        'echo "Running user data.."',
        'echo "Writing CloudWatch Agent configuration..."',
        'sudo tee /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json > /dev/null <<\'EOF\'',
        '{',
        '  "logs": {',
        '    "logs_collected": {',
        '      "files": {',
        '        "collect_list": [',
        '          {',
        '            "file_path": "/home/ubuntu/java.log",',
        '            "log_group_name": "/collector/logs",',
        '            "log_stream_name": "{instance_id}",',
        '            "timestamp_format": "%Y-%m-%d %H:%M:%S"',
        '          }',
        '        ]',
        '      }',
        '    }',
        '  }',
        '}',
        'EOF',
        'echo "Starting CloudWatch Agent..."',
        'sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s',
        'echo "Retrieving Maven credentials from Secrets Manager..."',
        `SECRET=$(aws secretsmanager get-secret-value --region us-east-1 --secret-id ${githubSecret.secretArn} --query SecretString --output text)`,
        'export MAVEN_USERNAME=$(echo "$SECRET" | jq -r \'.GITHUB_ACTOR\')',
        'export MAVEN_PASSWORD=$(echo "$SECRET" | jq -r \'.GITHUB_TOKEN\')',
        'echo "Maven username: $MAVEN_USERNAME"',
        'echo "Downloading the JAR from Maven...."',
        `wget --user=$MAVEN_USERNAME --password=$MAVEN_PASSWORD -O gnome-orchestrator.jar "https://maven.pkg.github.com/gnome-trading-group/gnome-orchestrator/group/gnometrading/gnome-orchestrator/${orchestratorVersion}/gnome-orchestrator-${orchestratorVersion}.jar"`,
        `export PROPERTIES_PATH="collector.properties"`,
        `export LISTING_ID="${item.listingId}"`,
        `export MAIN_CLASS="${item.mainClass}"`,
        `export BUCKET_NAME="${bucket.bucketName}"`,
        `export IDENTIFIER=$(ec2metadata --instance-id)`,
        'echo "Starting the Java application...."',
        'nohup java --add-opens=java.base/sun.nio.ch=ALL-UNNAMED -cp gnome-orchestrator.jar ${MAIN_CLASS} > /home/ubuntu/java.log 2>&1 &',
        'echo "Application started successfully."'
    );

    for (var i = 0; i < item.replicas; i++) {
      new ec2.Instance(this, `MarketCollectorListingId${item.listingId}-${i}-v5`, {
        vpc,
        userData,
        instanceType: ec2.InstanceType.of(
            ec2.InstanceClass.T2,
            ec2.InstanceSize.MICRO
        ),
        machineImage: ec2.MachineImage.genericLinux({
          [this.region]: AMIS["Ubuntu TLS 24.0 Azul JDK 17 v2"],
        }),
        instanceName: `MarketCollectorListingId${item.listingId}-${i}`,
        securityGroup,
        role,
        keyPair,
        userDataCausesReplacement: true,
      });
    }
  }
}