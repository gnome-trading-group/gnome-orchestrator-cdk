import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from "constructs";
import { CollectorStack } from "./stacks/collector-stack";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { CONFIGS, GITHUB_BRANCH, GITHUB_REPO, OrchestratorConfig } from "./config";
import { MonitoringStack } from "./stacks/monitoring-stack";
import { SlackStack } from "./stacks/slack-stack";


class AppStage extends cdk.Stage {

  constructor(scope: Construct, id: string, config: OrchestratorConfig) {
    super(scope, id, { env: config.account.environment });

    const monitoringStack = new MonitoringStack(this, "MonitoringStack", {
      config,
    });
    
    const collectorStack = new CollectorStack(this, "CollectorStack", {
      config,
      monitoringStack,
    });


    const slackStack = new SlackStack(this, "SlackStack", {
      config,
      topics: [monitoringStack.slackSnsTopic],
    });
  }
}

export class OrchestratorPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const npmSecret = secrets.Secret.fromSecretNameV2(this, 'NPMToken', 'npm-token');
    const githubSecret = secrets.Secret.fromSecretNameV2(this, 'GithubMaven', 'GITHUB_MAVEN');

    const pipeline = new pipelines.CodePipeline(this, "OrchestratorPipeline", {
      crossAccountKeys: true,
      pipelineName: "OrchestratorPipeline",
      synth: new pipelines.ShellStep("deploy", {
        input: pipelines.CodePipelineSource.gitHub(GITHUB_REPO, GITHUB_BRANCH),
        commands: [
          'echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" > ~/.npmrc',
          "npm ci",
          "npx cdk synth"
        ],
        env: {
          NPM_TOKEN: npmSecret.secretValue.unsafeUnwrap()
        }
      }),
      assetPublishingCodeBuildDefaults: {
        rolePolicy: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["secretsmanager:*"],
            resources: ["*"],
          })
        ],
        buildEnvironment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_ARM_3,
        },
      }
    });

    const dev = new AppStage(this, "Dev", CONFIGS[Stage.DEV]!);
    // const staging = new AppStage(this, "Staging", CONFIGS[Stage.STAGING]!);
    const prod = new AppStage(this, "Prod", CONFIGS[Stage.PROD]!);

    pipeline.addStage(dev);
    // pipeline.addStage(staging, {
    //   pre: [new pipelines.ManualApprovalStep('ApproveStaging')],
    // });
    pipeline.addStage(prod, {
      pre: [new pipelines.ManualApprovalStep('ApproveProd')],
    });

    pipeline.buildPipeline();
    npmSecret.grantRead(pipeline.synthProject.role!!);
    npmSecret.grantRead(pipeline.pipeline.role);
    githubSecret.grantRead(pipeline.synthProject.role!!);
    githubSecret.grantRead(pipeline.pipeline.role);
  }
}