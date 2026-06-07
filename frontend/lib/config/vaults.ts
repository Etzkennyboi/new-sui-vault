export interface OfficialVault {
  id: string;
  name: string;
  strategy: string;
  description: string;
  agentCapId: string;
  coinType: string;
  tvl?: string;
  apy?: string;
  risk?: string;
}

export const officialVaults: OfficialVault[] = [
  {
    id: "0x287a655c5e28dfcb01f1b4d139852986dab7f1dcfb46282f5b58ed70153d19c8",
    name: "Native USDC 50/50",
    tvl: "$0.00",
    apy: "12.4%",
    risk: "Medium",
    strategy: "Maintain a strict 50% SUI and 50% USDC portfolio. Take profits into USDC when SUI spikes, and buy SUI when it dips.",
    description: "The perfect vault for risk-averse investors who want exposure to SUI while maintaining a stablecoin cushion to buy the dips autonomously.",
    agentCapId: "0xb27e48d6202543807a5f8895e64a8aca6dc42b1ae1acde78fa1be2a86d14f5d1",
    coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", // Native USDC
  },
  {
    id: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", // Placeholder
    name: "SUI Grid Trading Bot",
    strategy: "Execute a grid trading strategy. Place buy orders when SUI drops 2% from the local average, and sell orders when SUI rises 2%. Continuously scalp small profits in ranging markets.",
    description: "A highly active strategy designed to profit from market volatility. It scalps small margins by continuously buying low and selling high within a tight grid.",
    agentCapId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", // Placeholder
    coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", // Native USDC
  },
  {
    id: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", // Placeholder
    name: "Momentum Trend Follower",
    strategy: "Follow the market trend. If SUI price increases 5% over 24 hours, shift portfolio to 80% SUI. If SUI price drops 5%, shift to 80% USDC. Ride the waves.",
    description: "An aggressive trend-following strategy that attempts to maximize exposure during bull runs and protect capital during sharp market downturns.",
    agentCapId: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", // Placeholder
    coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", // Native USDC
  }
];
