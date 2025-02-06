import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { COLLECTORS } from "./items";
import { AMIS } from "../config";

export interface CollectorStackProps extends cdk.StackProps {
  artifactBucket: s3.Bucket;
}

export class CollectorStack extends cdk.Stack {

  private static ORCHESTRATOR_VERSION = "1.0.0";

  constructor(scope: Construct, id: string, props: CollectorStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'CollectorBucket', {
      bucketName: 'market-data-collector',
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
    bucket.grantReadWrite(role);
    props.artifactBucket.grantRead(role);

    for (const item of COLLECTORS) {
      this.createEC2Instance(item, vpc, securityGroup, role, bucket, props.artifactBucket);
    }
  }

  private createEC2Instance(
    item: any[],
    vpc: ec2.Vpc,
    securityGroup: ec2.SecurityGroup,
    role: iam.Role,
    bucket: s3.Bucket,
    artifactBucket: s3.Bucket,
  ) {
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
        'echo "Running user data..."',
        'sudo apt update -y',
        'sudo apt install -y awscli',
        'mkdir -p /opt/myapp',
        // Install CloudWatchAgent
        'sudo apt install -y amazon-cloudwatch-agent',
        // Do not modify these indents. You will regret it.
        `cat <<EOF > /tmp/cloudwatch-config.json
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/lib/docker/containers/*/*.log",
            "log_group_name": "/collector/logs",
            "log_stream_name": "{instance_id}",
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          }
        ]
      }
    }
  }
}
EOF`,

        // Start CloudWatchAgent with the specified config
        'sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/tmp/cloudwatch-config.json',

        `aws s3 cp s3://${artifactBucket.bucketName}/gnome-orchestrator-${CollectorStack.ORCHESTRATOR_VERSION}.jar /opt/orchestrator/gnome-orchestrator.jar`,
        'chmod +x /opt/orchestrator/gnome-orchestrator.jar',
        'sudo systemctl restart orchestrator',

        // `$(aws ecr get-login --no-include-email --region ${this.region})`,
        // `sudo docker pull ${imageUri}`,
        // `sudo docker run --shm-size=2gb \
        // -e "MAIN_CLASS=${item[1]}" \
        // -e "PROPERTIES_PATH=collector.properties" \
        // -e "LISTING_ID=${item[0]}" \
        // -e "BUCKET_NAME=${bucket.bucketName}" \
        // -d ` + imageUri
    );

    // TODO: Only have a keypair on dev
    const keyPair = ec2.KeyPair.fromKeyPairName(this, 'DefaultKeyPair', 'DefaultKeyPair');

    const instance = new ec2.Instance(this, `MarketCollectorListingId${item[0]}-v5`, {
      vpc,
      userData,
      instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T2,
          ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.genericLinux({
        [this.region]: AMIS["Ubuntu TLS 24.0 Azul JDK 17"],
      }),
      instanceName: `MarketCollectorListingId${item[0]}`,
      securityGroup,
      role,
      keyPair,
      userDataCausesReplacement: true,
    });

    return instance;
  }
}