export interface LabelStudioBridgePort {
  handleWebhook(payload: unknown): Promise<void>;
  handleWebhookWithSignature(rawBody: string, signature: string): Promise<void>;
}
