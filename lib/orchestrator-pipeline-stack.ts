import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as config from "./config";
import { Construct } from "constructs";
import { CollectorStack } from "./collector/collector-stack";

interface AppStageProps extends cdk.StageProps {
  githubSecret: secretsmanager.ISecret;
}

class AppStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props);
    
    const collectorStack = new CollectorStack(this, "CollectorStack", {
      ...props,
    });
  }
}

export class OrchestratorPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubSecret = secretsmanager.Secret.fromSecretNameV2(this, 'GithubMavenSecret', 'GITHUB_MAVEN');
    githubSecret.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowEC2AccountAccess',
      effect: iam.Effect.ALLOW,
      principals: Object.values(config.ACCOUNTS).map(acc => new iam.AccountPrincipal(acc.account)),
      actions: ['secretsmanager:GetSecretValue'],
      resources: [githubSecret.secretArn],
    }));


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
      githubSecret,
    })
    const staging = new AppStage(this, "Staging", {
      env: config.ACCOUNTS.staging,
      githubSecret,
    });
    const prod = new AppStage(this, "Prod", {
      env: config.ACCOUNTS.prod,
      githubSecret,
    });

    pipeline.addStage(dev);
    pipeline.addStage(staging);
    pipeline.addStage(prod, {
      pre: [new pipelines.ManualApprovalStep('ApproveProd')],
    });
  }
}