export interface OfficialVault {
  id: string;
  name: string;
  strategy: string;
  description: string;
  agentCapId: string;
  coinType: string;
}

export const officialVaults: OfficialVault[] = [
  {
    id: "0xadd7421d3d113e9078f64e6ef53411547a0e07eb93e75717a208b110aea3f84e", // From my most recent test run!
    name: "Safe 50/50 Rebalancer",
    strategy: "Maintain a strict 50% SUI and 50% USDC portfolio. Take profits into USDC when SUI spikes, and buy SUI when it dips.",
    description: "The perfect vault for risk-averse investors who want exposure to SUI while maintaining a stablecoin cushion to buy the dips autonomously.",
    agentCapId: "0xdd94840950f1bc66944ef7de985d710b69dbdefae471273a15e669bc20e53c60",
    coinType: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN", // Wormhole USDC
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
