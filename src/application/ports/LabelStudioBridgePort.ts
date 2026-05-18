export interface LabelStudioBridgePort {
  handleWebhook(payload: unknown): Promise<void>;
}
