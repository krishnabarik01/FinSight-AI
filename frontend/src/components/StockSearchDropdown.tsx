import React from 'react';
import { StockSelector, type StockOption, type StockSelectorProps } from './common/StockSelector';

export type { StockOption };

export interface StockSearchDropdownProps extends Omit<StockSelectorProps, 'mode'> {
  onSelect?: (stock: StockOption) => void;
}

export const StockSearchDropdown: React.FC<StockSearchDropdownProps> = (props) => {
  return <StockSelector mode="single" {...props} />;
};

export default StockSearchDropdown;
