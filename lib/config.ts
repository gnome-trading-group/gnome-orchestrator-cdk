import { GnomeAccount, Stage } from "@gnome-trading-group/gnome-shared-cdk";

export interface CollectorInstance {
  listingId: number;
  mainClass: string;
  replicas: number;
}

export interface OrchestratorConfig {
  account: GnomeAccount;

  // Slack settings
  slackWorkspaceId: string;
  slackChannelConfigurationName: string;
  slackChannelId: string;

  // Collector settings
  allowCollectorSSH: boolean;
  collectors: CollectorInstance[];
  collectorOrchestratorVersion: string;
}

const defaultConfig = {
  slackWorkspaceId: "T08K71WNHSR",

  allowCollectorSSH: false,
  collectors: [
    { listingId: 1, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator", replicas: 2 }, // BTC
    { listingId: 2, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator", replicas: 2 }, // ETH
  ],
  collectorOrchestratorVersion: "1.0.16",
}

export const CONFIGS: { [stage in Stage]?:  OrchestratorConfig } = {
  [Stage.DEV]: {
    ...defaultConfig,
    account: GnomeAccount.InfraDev,

    slackChannelConfigurationName: "gnome-alerts-dev",
    slackChannelId: "C08KX2GAUE4",

    allowCollectorSSH: true,
  },
  [Stage.STAGING]: {
    ...defaultConfig,
    account: GnomeAccount.InfraStaging,

    slackChannelConfigurationName: "gnome-alerts-staging",
    slackChannelId: "C08KL9PGAQZ",
  },
  [Stage.PROD]: {
    ...defaultConfig,
    account: GnomeAccount.InfraProd,

    slackChannelConfigurationName: "gnome-alerts-prod",
    slackChannelId: "C08KD27QZKN",
  },
}

export const GITHUB_REPO = "gnome-trading-group/gnome-orchestrator-cdk";
export const GITHUB_BRANCH = "main";

export const AMIS = {
  'Ubuntu TLS 24.0 Azul JDK 17': 'ami-00989c0a54cd2c609',
  'Ubuntu TLS 24.0 Azul JDK 17 v2': 'ami-046c22ede26993b90',
}
