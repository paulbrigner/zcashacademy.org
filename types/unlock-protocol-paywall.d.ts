declare module '@unlock-protocol/paywall' {
  export class Paywall {
    constructor(config: any);
    connect(provider: any): Promise<void>;
    loadCheckoutModal(config: any): Promise<void>;
  }
}
