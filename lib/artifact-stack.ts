import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from 'constructs';

export class ArtifactStack extends cdk.Stack {

  public readonly artifactBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: 'orchestrator-artifacts',
    });

  }
}
