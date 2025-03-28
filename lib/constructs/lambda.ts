import * as cdk from "aws-cdk-lib";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as fs from 'fs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

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

      ARG MAVEN_SECRET_ARN
      ENV MAVEN_SECRET_ARN=$MAVEN_SECRET_ARN

      RUN echo "Fetching Maven credentials..." && \
          CREDENTIALS=$(aws secretsmanager get-secret-value --region ${props.region} --secret-id ${githubSecret.secretArn} --query SecretString --output text) && \
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
     
    this.lambdaInstance = new lambda.DockerImageFunction(this, props.lambdaName, {
      code: lambda.DockerImageCode.fromImageAsset(dockerDir),
      memorySize: props.memorySize ?? 4096,
      timeout: cdk.Duration.minutes(props.timeout ?? 10),
      role,
    });

    githubSecret.grantRead(this.lambdaInstance);
  }
}