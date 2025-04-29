import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';
import { AMIS, OrchestratorConfig } from "../config";
import { MonitoringStack } from "./monitoring-stack";

export interface CollectorECSStackProps extends cdk.StackProps {
  config: OrchestratorConfig;
  monitoringStack: MonitoringStack;
}

export class CollectorECSStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: CollectorECSStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'CollectorRawBucket', {
      bucketName: `market-data-${props.config.account.stage}`,
    });

    const vpc = new ec2.Vpc(this, 'CollectorECSVPC', {
      maxAzs: 2,
      natGateways: 0, // Avoid NAT Gateway costs
      subnetConfiguration: [
        {
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const ecsLogGroup = new logs.LogGroup(this, 'CollectorECSLogGroup', {
      logGroupName: '/ecs/collector',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });
    this.buildMonitoring(ecsLogGroup, props.monitoringStack);

    const taskRole = new iam.Role(this, 'EcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    bucket.grantReadWrite(taskRole);

    const cluster = new ecs.Cluster(this, 'CollectorECSCluster', { vpc });

    cluster.addCapacity('DefaultAutoScalingGroup', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      desiredCapacity: 1,
      machineImage: ec2.MachineImage.genericLinux({
        [this.region]: AMIS["Ubuntu TLS 24.0 Azul JDK 17 v2"],
      }),
    });

    const taskDef = new ecs.Ec2TaskDefinition(this, 'CollectorTaskDefinition', {
      networkMode: ecs.NetworkMode.BRIDGE,
      taskRole,
    });

    const dockerImage = new ecrAssets.DockerImageAsset(this, 'JavaAppImage', {
      directory: this.buildDockerfile(props.config.collectorOrchestratorVersion),
      buildSecrets: {
        MAVEN_CREDENTIALS: 'env=MAVEN_CREDENTIALS',
      },
    });

    taskDef.addContainer('CollectorContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(dockerImage),
      memoryLimitMiB: 512,
      cpu: 256,
      portMappings: [{ containerPort: 8080 }],
      environment: {
        MAIN_CLASS: 'group.gnometrading.collectors.HyperliquidCollectorOrchestrator',
      }, // TODO: Delete this
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'collector',
        logGroup: ecsLogGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
      },
    });
  }

  private buildDockerfile(orchestratorVersion: string) {
    const dockerDir = path.join(__dirname, `collector-docker`);

    if (!fs.existsSync(dockerDir)) {
      fs.mkdirSync(dockerDir);
    }

    const dockerfileContent = `
      FROM azul/zulu-openjdk:17

      RUN yum install -y wget jq

      ARG MAIN_CLASS

      RUN --mount=type=secret,id=MAVEN_CREDENTIALS \
        export MAVEN_CREDENTIALS=$(cat /run/secrets/MAVEN_CREDENTIALS) && \
        MAVEN_USERNAME=$(echo $MAVEN_CREDENTIALS | jq -r \'.GITHUB_ACTOR\') && \
        MAVEN_PASSWORD=$(echo $MAVEN_CREDENTIALS | jq -r \'.GITHUB_TOKEN\') && \
        wget --user=$MAVEN_USERNAME --password=$MAVEN_PASSWORD -O app.jar "https://maven.pkg.github.com/gnome-trading-group/gnome-orchestrator/group/gnometrading/gnome-orchestrator/${orchestratorVersion}/gnome-orchestrator-${orchestratorVersion}.jar"

      RUN echo '#!/bin/sh\\nexec java --add-opens=java.base/sun.nio.ch=ALL-UNNAMED -cp app.jar $MAIN_CLASS' > start.sh && chmod +x start.sh

      CMD ["./start.sh"]
    `.trim();

    fs.writeFileSync(path.join(dockerDir, 'Dockerfile'), dockerfileContent);
    return dockerDir;
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

    const alarm = new cw.Alarm(this, 'CollectorECSErrorAlarm', {
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
}
