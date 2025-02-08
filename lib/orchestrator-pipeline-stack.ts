import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as config from "./config";
import { Construct } from "constructs";
import { CollectorStack } from "./collector/collector-stack";

class AppStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    
    const collectorStack = new CollectorStack(this, "CollectorStack", {
      ...props,
    });
  }
}

export class OrchestratorPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new pipelines.CodePipeline(this, "OrchestratorPipeline", {
      crossAccountKeys: true,
      pipelineName: "OrchestratorPipeline",
      synth: new pipelines.ShellStep("deploy", {
        input: pipelines.CodePipelineSource.gitHub(config.GITHUB_REPO, config.GITHUB_BRANCH),
        commands: [ 
          "npm ci",
          "npx cdk synth"
        ],
      }),
    });

    const dev = new AppStage(this, "Dev", {
      env: config.ACCOUNTS.dev,
    })
    const staging = new AppStage(this, "Staging", {
      env: config.ACCOUNTS.staging,
    });
    const prod = new AppStage(this, "Prod", {
      env: config.ACCOUNTS.prod,
    });

    pipeline.addStage(dev);
    pipeline.addStage(staging);
    pipeline.addStage(prod, {
      pre: [new pipelines.ManualApprovalStep('ApproveProd')],
    });
  }
}