import React, { useState } from 'react';
import { GoldView } from '../components/metals/GoldView';
import { SilverView } from '../components/metals/SilverView';

interface MetalsPageProps {
  onSelectStock?: (symbol: string) => void;
  defaultMetal?: 'gold' | 'silver';
}

export const MetalsPage: React.FC<MetalsPageProps> = ({ defaultMetal = 'gold' }) => {
  const [activeMetal, setActiveMetal] = useState<'gold' | 'silver'>(defaultMetal);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {activeMetal === 'gold' ? (
        <GoldView onSwitchToSilver={() => setActiveMetal('silver')} />
      ) : (
        <SilverView onSwitchToGold={() => setActiveMetal('gold')} />
      )}
    </div>
  );
};

export const GoldPage: React.FC<MetalsPageProps> = (props) => (
  <MetalsPage {...props} defaultMetal="gold" />
);

export default MetalsPage;
