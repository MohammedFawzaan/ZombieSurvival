import { PurchaseResult } from '../state/types';

export interface PowerActivation {
  result: PurchaseResult;
  switchId: string | null;
}

export class PowerSystem {
  private active = false;
  private switchId: string | null = null;

  onPowerOn: ((switchId: string) => void) | null = null;

  private readonly outcome: PowerActivation = { result: PurchaseResult.Ok, switchId: null };

  get on(): boolean {
    return this.active;
  }

  get sourceSwitchId(): string | null {
    return this.switchId;
  }

  reset(): void {
    this.active = false;
    this.switchId = null;
  }

  canActivate(): boolean {
    return !this.active;
  }

  activate(switchId: string): PowerActivation {
    const o = this.outcome;
    o.switchId = switchId;
    if (this.active) {
      o.result = PurchaseResult.AlreadyOwned;
      return o;
    }
    this.active = true;
    this.switchId = switchId;
    o.result = PurchaseResult.Ok;
    this.onPowerOn?.(switchId);
    return o;
  }
}
