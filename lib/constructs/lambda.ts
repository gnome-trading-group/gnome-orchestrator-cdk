import * as cdk from "aws-cdk-lib";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as fs from 'fs';
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

    const dockerfileContent = `
      FROM public.ecr.aws/lambda/java:17

      RUN yum install -y wget jq

      ARG MAVEN_CREDENTIALS
      ENV MAVEN_CREDENTIALS=$MAVEN_CREDENTIALS
      RUN echo $MAVEN_CREDENTIALS
      RUN echo $MAVEN_CREDENTIALS | jq -r \'.GITHUB_ACTOR\'

      RUN echo "Fetching Maven credentials..." && \
          MAVEN_USERNAME=$(echo $MAVEN_CREDENTIALS | jq -r \'.GITHUB_ACTOR\') && \
          MAVEN_PASSWORD=$(echo $MAVEN_CREDENTIALS | jq -r \'.GITHUB_TOKEN\') && \
          wget --user=$MAVEN_USERNAME --password=$MAVEN_PASSWORD -O /var/task/lambda.jar "https://maven.pkg.github.com/gnome-trading-group/gnome-orchestrator/group/gnometrading/gnome-orchestrator/${props.orchestratorVersion}/gnome-orchestrator-${props.orchestratorVersion}.jar"
      
      CMD ["${props.classPath}::handleRequest"]
    `;
    fs.writeFileSync(path.join(dockerDir, 'Dockerfile'), dockerfileContent);

    const role = new iam.Role(this, `${props.lambdaName}Role`, {
      description: `Execution role for ${props.lambdaName}`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    this.lambdaInstance = new lambda.DockerImageFunction(this, props.lambdaName, {
      code: lambda.DockerImageCode.fromImageAsset(dockerDir, {
        buildArgs: {
          MAVEN_CREDENTIALS: "$MAVEN_CREDENTIALS",
        },
      }),
      memorySize: props.memorySize ?? 4096,
      timeout: cdk.Duration.minutes(props.timeout ?? 10),
      role,
    });
  }
}