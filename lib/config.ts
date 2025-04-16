import { GnomeAccount, Stage } from "@gnome-trading-group/gnome-shared-cdk";

export interface CollectorInstance {
  listingIds: number[];
  mainClass: string;
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
    { listingIds: [1, 2, 3], mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
  ],
  collectorOrchestratorVersion: "1.0.21",
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

    collectors: [
      // { listingId: 1, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 2, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 3, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 4, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 5, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 6, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 7, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 8, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 9, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 10, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 11, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 12, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 13, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 14, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 15, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 16, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 17, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 18, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 19, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 20, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 21, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 22, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 23, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 24, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 25, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 26, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
      // { listingId: 27, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator" },
    ],
  },
}

export const GITHUB_REPO = "gnome-trading-group/gnome-orchestrator-cdk";
export const GITHUB_BRANCH = "main";

export const AMIS = {
  'Ubuntu TLS 24.0 Azul JDK 17': 'ami-00989c0a54cd2c609',
  'Ubuntu TLS 24.0 Azul JDK 17 v2': 'ami-046c22ede26993b90',
}
