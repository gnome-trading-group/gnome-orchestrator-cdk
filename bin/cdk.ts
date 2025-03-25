#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OrchestratorPipelineStack } from '../lib/orchestrator-pipeline-stack';
import { GnomeAccount } from '@gnome-trading-group/gnome-shared-cdk';

const app = new cdk.App();
new OrchestratorPipelineStack(app, 'OrchestratorPipelineStack', {
  env: GnomeAccount.InfraPipelines.environment,
});
app.synth();
