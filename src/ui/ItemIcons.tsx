import { memo } from 'react';

const STROKE = 'currentColor';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="item-icon"
      viewBox="0 0 64 32"
      fill="none"
      stroke={STROKE}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const PistolIcon = memo(function PistolIcon() {
  return (
    <Frame>
      <path d="M18 13h22v5H30l-1 1" fill="rgba(255,255,255,0.08)" />
      <path d="M29 19l-4 8h-5l3-9" fill="rgba(255,255,255,0.05)" />
      <path d="M40 15.5h5" />
      <circle cx="26" cy="20.5" r="1.1" fill={STROKE} stroke="none" />
      <path d="M20 13v-1.5h6V13" />
    </Frame>
  );
});

const RifleIcon = memo(function RifleIcon() {
  return (
    <Frame>
      <path d="M8 15h34v4H8z" fill="rgba(255,255,255,0.08)" />
      <path d="M42 16h12" />
      <path d="M8 15l-3 1.5 3 1.5" fill="rgba(255,255,255,0.05)" />
      <path d="M22 19l-2 7h-4l1.5-7" fill="rgba(255,255,255,0.05)" />
      <path d="M28 19v4h7v-4" />
      <path d="M26 15v-3h5v3" />
      <circle cx="19" cy="20.5" r="1" fill={STROKE} stroke="none" />
    </Frame>
  );
});

const ShotgunIcon = memo(function ShotgunIcon() {
  return (
    <Frame>
      <path d="M8 14h30v5H8z" fill="rgba(255,255,255,0.08)" />
      <path d="M38 15h16" />
      <path d="M38 18.5h13" strokeWidth={2.2} />
      <path d="M8 14l-4 2 4 2" fill="rgba(255,255,255,0.05)" />
      <path d="M20 19l-2 6h-4l1.5-6" fill="rgba(255,255,255,0.05)" />
      <path d="M40 19h9v2h-9z" fill="rgba(255,255,255,0.12)" />
      <circle cx="17" cy="20.3" r="1" fill={STROKE} stroke="none" />
    </Frame>
  );
});

const MacheteIcon = memo(function MacheteIcon() {
  return (
    <Frame>
      <path d="M14 22l26-12 6 2-28 13z" fill="rgba(255,255,255,0.1)" />
      <path d="M40 10l6 2" />
      <path d="M14 22l-6 3 2 3 6-3z" fill="rgba(255,255,255,0.06)" />
      <path d="M12 20.5l2 3.5" />
    </Frame>
  );
});

const BandageIcon = memo(function BandageIcon() {
  return (
    <Frame>
      <rect x="18" y="11" width="28" height="10" rx="5" fill="rgba(255,255,255,0.08)" />
      <path d="M27 11.5v9M37 11.5v9" />
      <path d="M30 14.5h4v3h-4z" fill={STROKE} stroke="none" opacity={0.55} />
    </Frame>
  );
});

const MedkitIcon = memo(function MedkitIcon() {
  return (
    <Frame>
      <rect x="19" y="9" width="26" height="16" rx="2.5" fill="rgba(255,255,255,0.08)" />
      <path d="M28 9V7h8v2" />
      <path d="M32 13v8M28 17h8" strokeWidth={2} />
      <path d="M19 15h26" opacity={0.35} />
    </Frame>
  );
});

const AmmoIcon = memo(function AmmoIcon() {
  return (
    <Frame>
      <path d="M26 12h8v11h-8z" fill="rgba(255,255,255,0.08)" />
      <path d="M26 12l4-5 4 5" fill="rgba(255,255,255,0.14)" />
      <path d="M26 23h8v2h-8z" fill="rgba(255,255,255,0.06)" />
      <path d="M38 15h5M38 19h5" opacity={0.45} />
    </Frame>
  );
});

const ICONS: Record<string, React.ComponentType> = {
  pistol: PistolIcon,
  rifle: RifleIcon,
  shotgun: ShotgunIcon,
  machete: MacheteIcon,
  bandage: BandageIcon,
  medkit: MedkitIcon,
  ammo: AmmoIcon,
};

export const ItemIcon = memo(function ItemIcon({ id }: { id: string }) {
  const Cmp = ICONS[id] ?? AmmoIcon;
  return <Cmp />;
});

export const BagIcon = memo(function BagIcon() {
  return (
    <svg
      className="bag-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke={STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 8h14l-1.2 12H6.2z" fill="rgba(255,255,255,0.07)" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M5 12.5h14" opacity={0.4} />
    </svg>
  );
});
