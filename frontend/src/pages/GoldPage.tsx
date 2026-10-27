import React from 'react';
import { MetalsPage } from './MetalsPage';

interface GoldPageProps {
  onSelectStock?: (symbol: string) => void;
}

export const GoldPage: React.FC<GoldPageProps> = (props) => {
  return <MetalsPage {...props} defaultMetal="gold" />;
};

export default GoldPage;
