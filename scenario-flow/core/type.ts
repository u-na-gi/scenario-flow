export interface ScenarioFlowConfig {
  apiBaseUrl: string;
}

export interface ScenarioFlowRequest extends RequestInit {
  urlPaths: string[];
}
