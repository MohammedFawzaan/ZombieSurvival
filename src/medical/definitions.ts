import type { MedicalId } from '../state/types';

export interface MedicalDef {
  id: MedicalId;
  name: string;
  heal: number;
  useTime: number;
  cancelOnDamage: boolean;
  stackLimit: number;
  minHealthDeficit: number;
}

export const MEDICAL: Record<MedicalId, MedicalDef> = {
  bandage: {
    id: 'bandage',
    name: 'Bandage',
    heal: 25,
    useTime: 2.4,
    cancelOnDamage: false,
    stackLimit: 8,
    minHealthDeficit: 1,
  },
  medkit: {
    id: 'medkit',
    name: 'Medkit',
    heal: 65,
    useTime: 5.5,
    cancelOnDamage: true,
    stackLimit: 3,
    minHealthDeficit: 1,
  },
};

export const MEDICAL_ORDER: readonly MedicalId[] = ['bandage', 'medkit'];
