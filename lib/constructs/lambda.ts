import * as cdk from "aws-cdk-lib";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as fs from 'fs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { execSync } from 'child_process';

export interface OrchestratorLambdaProps {
  orchestratorVersion: string;
  classPath: string;
  lambdaName: string;
  region: string;
  memorySize?: number;
  timeout?: number;
}

export class OrchestratorLambda extends Construct {

  public readonly lambdaInstance: lambda.IFunction;

  constructor(scope: Construct, id: string, props: OrchestratorLambdaProps) {
    super(scope, id);

    const dockerDir = path.join(__dirname, `${props.lambdaName}-docker`);

    if (!fs.existsSync(dockerDir)) {
      fs.mkdirSync(dockerDir);
    }

    const githubSecret = secretsmanager.Secret.fromSecretNameV2(this, 'GithubMaven', 'GITHUB_MAVEN');

    const dockerfileContent = `
      FROM public.ecr.aws/lambda/java:17

      RUN yum install -y maven aws-cli jq

      ARG CREDENTIALS
      ENV CREDENTIALS=$CREDENTIALS
      RUN echo $CREDENTIALS

      RUN echo "Fetching Maven credentials..." && \
          MAVEN_USERNAME=$(echo $CREDENTIALS | jq -r \'.GITHUB_ACTOR\') && \
          MAVEN_PASSWORD=$(echo $CREDENTIALS | jq -r \'.GITHUB_TOKEN\') && \
          echo "Setting up Maven authentication..." && \
          mkdir -p /root/.m2 && \
          echo "<settings><servers><server><id>github</id><username>$MAVEN_USERNAME</username><password>$MAVEN_PASSWORD</password></server></servers></settings>" > /root/.m2/settings.xml
      
      RUN mvn dependency:get -Dartifact=group.gnometrading:gnome-orchestrator:${props.orchestratorVersion} -Ddest=/var/task/lambda.jar

      CMD ["${props.classPath}::handleRequest"]
    `;
    fs.writeFileSync(path.join(dockerDir, 'Dockerfile'), dockerfileContent);

    const role = new iam.Role(this, `${props.lambdaName}Role`, {
      description: `Execution role for ${props.lambdaName}`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    const credentials = execSync(
      `aws secretsmanager get-secret-value --region ${props.region} --secret-id ${githubSecret.secretArn} --query SecretString --output text`,
      {
          encoding: 'utf8',
      },
    ).trim();
     
    this.lambdaInstance = new lambda.DockerImageFunction(this, props.lambdaName, {
      code: lambda.DockerImageCode.fromImageAsset(dockerDir, {
        buildArgs: {
          CREDENTIALS: credentials
        }
      }),
      memorySize: props.memorySize ?? 4096,
      timeout: cdk.Duration.minutes(props.timeout ?? 10),
      role,
    });
  }
}