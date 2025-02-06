import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as config from "./config";
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from "constructs";
import { CollectorStack } from "./collector/collector-stack";
import { BuildSpec } from "aws-cdk-lib/aws-codebuild";
import { ArtifactStack } from "./artifact-stack";

class AppStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    
    const collectorStack = new CollectorStack(this, "CollectorStack", {
      ...props,
      artifactBucket: artifactStack.artifactBucket,
    });
  }
}

export class OrchestratorPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const artifactStack = new ArtifactStack(this, "ArtifactStack", {
      ...props,
    });
    
    const githubSecret = secretsmanager.Secret.fromSecretNameV2(this, 'GithubMavenSecret', 'GITHUB_MAVEN');
    const input = pipelines.CodePipelineSource.gitHub(config.GITHUB_REPO, config.GITHUB_BRANCH);

    const pipeline = new pipelines.CodePipeline(this, "OrchestratorPipeline", {
      crossAccountKeys: true,
      pipelineName: "OrchestratorPipeline",
      synth: new pipelines.ShellStep("deploy", {
        input,
        commands: [ 
          "cd ./cdk",
          "npm ci",
          "npx cdk synth"
        ],
        primaryOutputDirectory: "cdk/cdk.out",
      }),
    });

    const buildStep = new pipelines.CodeBuildStep('BuildJavaApp', {
      input,
      commands: [
        'mvn clean package -DskipTests',
        'VERSION=$(mvn help:evaluate -Dexpression=project.version -q -DforceStdout)',
        'JAR_FILE=$(ls target/gnome-orchestrator-*.jar | head -n 1)',
        `aws s3 cp $JAR_FILE s3://${artifactStack.artifactBucket.bucketName}/gnome-orchestrator-$VERSION.jar`,
      ],
      partialBuildSpec: BuildSpec.fromObject({
        env: {
          variables: {
            GITHUB_ACTOR: githubSecret.secretValueFromJson('GITHUB_ACTOR').unsafeUnwrap(),
            GITHUB_TOKEN: githubSecret.secretValueFromJson('GITHUB_TOKEN').unsafeUnwrap(),
          }
        },
      }),
    });
    // artifactBucket.grantPut(buildStep.actionRole);

    pipeline.addWave('DeployJar', {pre: [buildStep]});

    const dev = new AppStage(this, "Dev", {
      env: config.ACCOUNTS.dev,
      artifactBucket,
    })
    const staging = new AppStage(this, "Staging", {
      env: config.ACCOUNTS.staging,
      artifactBucket,
    });
    const prod = new AppStage(this, "Prod", {
      env: config.ACCOUNTS.prod,
      artifactBucket,
    });

    pipeline.addStage(dev);
    pipeline.addStage(staging);
    pipeline.addStage(prod, {
      pre: [new pipelines.ManualApprovalStep('ApproveProd')],
    });
  }
}