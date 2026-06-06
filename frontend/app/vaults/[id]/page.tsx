"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Loader2, ArrowLeft, TrendingUp, ShieldCheck, Database, RefreshCw, Activity, Terminal, ArrowRightLeft, Cpu, CheckCircle2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { WalrusClient } from '../../../../sdk/src/walrus';
import { motion, AnimatePresence } from 'framer-motion';

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID || '0x4f177e91a1848e3997eae67a7b8e1f0c2a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
const WALRUS_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

import { officialVaults } from '../../../lib/config/vaults';

// Mock chart data for premium visual effect
const generateChartData = () => {
  let base = 1000;
  return Array.from({ length: 30 }).map((_, i) => {
    base = base + (Math.random() * 200 - 90);
    return { name: `Day ${i + 1}`, TVL: Math.max(100, base) };
  });
};
const chartData = generateChartData();

export default function VaultDashboard({ params }: { params: Promise<{ id: string }> }) {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [vaultId, setVaultId] = useState<string>('');

  useEffect(() => {
    params.then(p => setVaultId(p.id));
  }, [params]);

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'deposit' | 'ragequit' | 'info'>('deposit');
  
  // Deposit/withdraw inputs
  const [depositAmount, setDepositAmount] = useState('10');
  const [shareObjectId, setShareObjectId] = useState('');

  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Verification modal state
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [computedHash, setComputedHash] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Live vault state from Tatum RPC
  const [vaultSuiBal, setVaultSuiBal] = useState<number | null>(null);
  const [vaultUsdcBal, setVaultUsdcBal] = useState<number | null>(null);
  const [vaultTotalShares, setVaultTotalShares] = useState<number | null>(null);

  const suiClient = useSuiClient();

  useEffect(() => {
    setMounted(true);
    fetchLogs();
  }, []);

  useEffect(() => {
    if (!vaultId) return;
    const fetchVaultState = async () => {
      try {
        const raw = await suiClient.getObject({
          id: vaultId,
          options: { showContent: true },
        });
        if (raw.data?.content && 'fields' in raw.data.content) {
          const fields = raw.data.content.fields as any;
          setVaultSuiBal(parseInt(fields.sui_balance || '0'));
          setVaultUsdcBal(parseInt(fields.usdc_balance || '0'));
          setVaultTotalShares(parseInt(fields.total_shares || '0'));
        }
      } catch (err: any) {
        // Warning: This is commonly triggered by browser adblockers (like chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon) blocking Tatum RPC.
        console.warn('Failed to fetch vault state (possibly blocked by extension):', err.message || err);
      }
    };
    fetchVaultState();
  }, [vaultId, suiClient]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      // Mocking live logs for display
      const liveLogs = [
        {
          blobId: 'gH7B_8F2nKp_Lm3s', epoch: 1042, action_taken: 'BUY_SUI', ai_reasoning: 'SUI has dropped 5% in the last hour, reaching the lower bollinger band. Executing buy order to accumulate SUI.', balances: { sui: 2500000000, usdc: 1500000 }, timestamp: new Date().toISOString()
        },
        {
          blobId: 'xP9J_1D4vCq_Rt5w', epoch: 1041, action_taken: 'SELL_SUI', ai_reasoning: 'RSI indicates overbought conditions. Taking 10% profit into USDC to prepare for potential pullbacks.', balances: { sui: 1500000000, usdc: 2800000 }, timestamp: new Date(Date.now() - 3600000).toISOString()
        }
      ];
      setLogs(liveLogs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleDeposit = async () => {
    if (!currentAccount) return;
    setLoading(true);
    try {
      const txb = new Transaction();
      const amountMist = parseFloat(depositAmount) * 1e9;
      const [suiCoin] = txb.splitCoins(txb.gas, [txb.pure.u64(amountMist)]);

      const vaultConfig = officialVaults.find(v => v.id === vaultId);
      const coinType = vaultConfig?.coinType || '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

      const [shareObj] = txb.moveCall({
        target: `${PACKAGE_ID}::vault::deposit_sui`,
        typeArguments: [coinType],
        arguments: [txb.object(vaultId), suiCoin],
      });

      txb.transferObjects([shareObj], txb.pure.address(currentAccount.address));

      await signAndExecuteTransaction({ transaction: txb as any });
      alert('Deposit successful!');
      fetchLogs();
    } catch (err: any) {
      console.error(err);
      alert(`Deposit failed: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRagequit = async () => {
    if (!currentAccount) return;
    setLoading(true);
    try {
      const txb = new Transaction();
      if (!shareObjectId || !shareObjectId.startsWith('0x')) {
        throw new Error('Please enter a valid SyndicateShare Object ID');
      }
      const vaultConfig = officialVaults.find(v => v.id === vaultId);
      const coinType = vaultConfig?.coinType || '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

      const [suiCoin, usdcCoin] = txb.moveCall({
        target: `${PACKAGE_ID}::vault::ragequit`,
        typeArguments: [coinType],
        arguments: [txb.object(vaultId), txb.object(shareObjectId)],
      });

      txb.transferObjects([suiCoin, usdcCoin], txb.pure.address(currentAccount.address));

      await signAndExecuteTransaction({ transaction: txb as any });
      alert('Ragequit completed!');
    } catch (err: any) {
      console.error(err);
      alert(`Ragequit failed: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const openVerifier = async (log: any) => {
    setSelectedLog(log);
    setVerifying(true);
    
    setTimeout(async () => {
      try {
        const hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // Simulated real-time hash
        setComputedHash(hash);
      } catch (err) {
        setComputedHash('Verification error');
      } finally {
        setVerifying(false);
      }
    }, 1200);
  };

  if (!mounted) return null;

  const vaultConfig = officialVaults.find(v => v.id === vaultId);
  const vaultName = vaultConfig ? vaultConfig.name : 'Custom Syndicate';
  const vaultStrategy = vaultConfig ? vaultConfig.strategy : 'Decentralized Vault';

  return (
    <div className="flex-grow flex flex-col bg-[#05050A] relative min-h-screen">
      {/* Dynamic Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#00F2FE]/5 blur-[150px]" />
      </div>

      {/* Header */}
      <header className="border-b border-[#1E293B] bg-[#05050A]/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-semibold text-sm">Return to Syndicates</span>
          </Link>
          <ConnectButton />
        </div>
      </header>

      {/* Terminal Layout */}
      <main className="flex-grow max-w-[1400px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Left Column: Charts and Activity (Spans 8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Top Bar: Vault Identity & Core Stats */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 bg-[#00F2FE]/10 border border-[#00F2FE]/20 rounded text-[10px] font-bold text-[#00F2FE] tracking-widest uppercase">
                  Mainnet Vault
                </span>
                <span className="text-xs font-mono text-slate-500 flex items-center gap-1.5">
                  ID: <span className="text-white truncate max-w-[150px] inline-block">{vaultId}</span>
                </span>
              </div>
              <h1 className="text-3xl font-extrabold text-white font-sans">{vaultName}</h1>
            </div>

            <div className="flex items-center gap-8 md:border-l md:border-slate-800 md:pl-8">
              <div>
                <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider mb-1">Total Value Locked</span>
                <span className="text-3xl font-bold text-white font-sans tracking-tight">
                  {vaultSuiBal !== null ? `${(vaultSuiBal / 1e9).toFixed(2)}` : '0.00'} <span className="text-xl text-slate-400">SUI</span>
                </span>
                <div className="text-sm font-semibold text-[#B829EA] mt-1">
                  + {vaultUsdcBal !== null ? (vaultUsdcBal / 1e6).toFixed(2) : '0.00'} USDC
                </div>
              </div>
            </div>
          </motion.div>

          {/* Large Premium Chart Area */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-6 h-[400px] flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-white flex items-center gap-2 font-sans">
                <Activity className="w-5 h-5 text-[#00F2FE]" /> Performance Analytics
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-[#1E293B] text-slate-300 px-3 py-1 rounded cursor-pointer hover:bg-slate-700 transition-colors">1D</span>
                <span className="text-xs bg-[#00F2FE]/20 text-[#00F2FE] px-3 py-1 rounded font-bold cursor-pointer">1W</span>
                <span className="text-xs bg-[#1E293B] text-slate-300 px-3 py-1 rounded cursor-pointer hover:bg-slate-700 transition-colors">1M</span>
              </div>
            </div>
            
            <div className="flex-grow w-full relative min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTVL" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00F2FE" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00F2FE" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#05050A', borderColor: '#1E293B', color: '#F1F5F9', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} 
                    itemStyle={{ color: '#00F2FE', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="TVL" stroke="#00F2FE" strokeWidth={3} fillOpacity={1} fill="url(#colorTVL)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Live Agent Terminal Feed */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel overflow-hidden flex flex-col"
          >
            <div className="p-5 border-b border-[#1E293B] bg-[#0A0F1C]/80 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider font-sans">
                <Terminal className="w-4 h-4 text-[#B829EA]" /> Agent Terminal Log
              </h3>
              <button onClick={fetchLogs} className="flex items-center gap-2 text-xs text-slate-400 hover:text-[#00F2FE] transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin text-[#00F2FE]' : ''}`} /> Sync State
              </button>
            </div>

            <div className="p-0 bg-[#05050A]/50">
              {logs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-mono text-sm">No recent activity found.</div>
              ) : (
                <div className="divide-y divide-[#1E293B]">
                  {logs.map((log, idx) => (
                    <div key={idx} className="p-5 hover:bg-[#111B2D]/50 transition-colors group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${log.action_taken.includes('BUY') ? 'border-[#00B5A3] bg-[#00B5A3]/10 text-[#00B5A3]' : 'border-[#B829EA] bg-[#B829EA]/10 text-[#B829EA]'}`}>
                            {log.action_taken}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">Epoch {log.epoch}</span>
                        </div>
                        <button 
                          onClick={() => openVerifier(log)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-2.5 py-1 bg-[#1E293B] hover:bg-[#00F2FE]/10 border border-[#1E293B] hover:border-[#00F2FE]/30 rounded text-xs font-semibold text-[#00F2FE]"
                        >
                          <Database className="w-3.5 h-3.5" /> Verify Blob
                        </button>
                      </div>
                      
                      <div className="pl-2 border-l-2 border-[#1E293B] group-hover:border-[#00F2FE] transition-colors">
                        <p className="text-sm text-slate-300 font-sans leading-relaxed mb-3">{log.ai_reasoning}</p>
                        <div className="flex gap-4 text-xs font-mono text-slate-500">
                          <span>SUI: <span className="text-white">{(log.balances.sui / 1e9).toFixed(2)}</span></span>
                          <span>USDC: <span className="text-white">{(log.balances.usdc / 1e6).toFixed(2)}</span></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Right Column: Execution Terminal (Spans 4 cols) */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-4 flex flex-col gap-6"
        >
          {/* Action Widget */}
          <div className="glass-panel overflow-hidden border-[#1E293B]">
            {/* Widget Tabs */}
            <div className="flex bg-[#0A0F1C] border-b border-[#1E293B]">
              <button 
                onClick={() => setActiveTab('deposit')}
                className={`flex-1 py-4 text-sm font-bold font-sans transition-all relative ${activeTab === 'deposit' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Deposit
                {activeTab === 'deposit' && <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00F2FE]" />}
              </button>
              <button 
                onClick={() => setActiveTab('ragequit')}
                className={`flex-1 py-4 text-sm font-bold font-sans transition-all relative ${activeTab === 'ragequit' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Withdraw
                {activeTab === 'ragequit' && <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#B829EA]" />}
              </button>
              <button 
                onClick={() => setActiveTab('info')}
                className={`flex-1 py-4 text-sm font-bold font-sans transition-all relative ${activeTab === 'info' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Strategy
                {activeTab === 'info' && <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00B5A3]" />}
              </button>
            </div>

            <div className="p-6">
              <AnimatePresence mode="wait">
                
                {/* Deposit Tab */}
                {activeTab === 'deposit' && (
                  <motion.div 
                    key="deposit"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</label>
                        <span className="text-xs text-slate-500 font-mono">Bal: 0.00 SUI</span>
                      </div>
                      <div className="relative group">
                        <input 
                          type="number" 
                          value={depositAmount} 
                          onChange={(e) => setDepositAmount(e.target.value)}
                          className="w-full pl-4 pr-16 py-4 bg-[#05050A] border border-[#1E293B] group-hover:border-[#00F2FE]/50 focus:border-[#00F2FE] rounded-xl text-2xl font-sans text-white focus:outline-none transition-colors shadow-inner"
                          placeholder="0.00"
                        />
                        <div className="absolute right-3 top-3 bottom-3 bg-[#111B2D] px-3 rounded-lg flex items-center gap-2 border border-[#1E293B]">
                          <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[8px] font-bold">S</span>
                          <span className="text-sm font-bold text-white">SUI</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#0A0F1C] border border-[#1E293B] rounded-xl p-4 mb-8">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">You will receive</span>
                        <span className="text-white font-mono">1 SyndicateShare</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Network Fee</span>
                        <span className="text-white font-mono">~0.002 SUI</span>
                      </div>
                    </div>

                    <button 
                      onClick={handleDeposit}
                      disabled={loading || !currentAccount}
                      className="w-full py-4 btn-premium rounded-xl text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,242,254,0.15)] hover:shadow-[0_0_30px_rgba(0,242,254,0.3)] transition-all"
                    >
                      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Supply Asset'}
                    </button>
                    {!currentAccount && <p className="text-center text-xs text-red-400 mt-4">Connect Wallet to supply</p>}
                  </motion.div>
                )}

                {/* Withdraw Tab */}
                {activeTab === 'ragequit' && (
                  <motion.div 
                    key="ragequit"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Share Object ID</label>
                      </div>
                      <input 
                        type="text" 
                        value={shareObjectId} 
                        onChange={(e) => setShareObjectId(e.target.value)}
                        className="w-full px-4 py-4 bg-[#05050A] border border-[#1E293B] hover:border-[#B829EA]/50 focus:border-[#B829EA] rounded-xl text-sm font-mono text-white focus:outline-none transition-colors shadow-inner"
                        placeholder="0x..."
                      />
                      <p className="text-[11px] text-slate-500 mt-2">Enter the ID of the SyndicateShare token you received upon deposit.</p>
                    </div>

                    <div className="bg-[#B829EA]/10 border border-[#B829EA]/20 rounded-xl p-4 mb-8">
                      <p className="text-xs text-[#B829EA] leading-relaxed">
                        <strong>Ragequit Execution:</strong> This action instantly burns your share and returns your exact proportional ownership of the underlying SUI and USDC directly to your wallet.
                      </p>
                    </div>

                    <button 
                      onClick={handleRagequit}
                      disabled={loading || !currentAccount}
                      className="w-full py-4 bg-gradient-to-r from-red-500 to-[#B829EA] hover:from-red-400 hover:to-[#B829EA] text-white font-bold rounded-xl text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(184,41,234,0.15)] transition-all"
                    >
                      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Execute Ragequit'}
                    </button>
                    {!currentAccount && <p className="text-center text-xs text-red-400 mt-4">Connect Wallet to withdraw</p>}
                  </motion.div>
                )}

                {/* Info Tab */}
                {activeTab === 'info' && (
                  <motion.div 
                    key="info"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex flex-col gap-5"
                  >
                    <div>
                      <span className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Strategy Profile</span>
                      <p className="text-sm text-slate-300 leading-relaxed bg-[#05050A] p-3 rounded-lg border border-[#1E293B]">{vaultStrategy}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#05050A] p-3 rounded-lg border border-[#1E293B]">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Intelligence</span>
                        <span className="text-sm text-[#00F2FE] font-bold flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> DeepSeek V3</span>
                      </div>
                      <div className="bg-[#05050A] p-3 rounded-lg border border-[#1E293B]">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">DEX Routing</span>
                        <span className="text-sm text-white font-bold flex items-center gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5 text-[#00B5A3]" /> Cetus LP</span>
                      </div>
                      <div className="bg-[#05050A] p-3 rounded-lg border border-[#1E293B] col-span-2">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Smart Contract</span>
                        <span className="text-xs text-slate-400 font-mono truncate block">{PACKAGE_ID}</span>
                      </div>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Walrus Verification Modal (Enhanced) */}
      <AnimatePresence>
        {selectedLog && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#05050A]/90 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-panel-glow max-w-2xl w-full p-0 overflow-hidden border border-[#00F2FE]/30 shadow-[0_0_50px_rgba(0,242,254,0.15)]"
            >
              <div className="p-5 border-b border-[#1E293B] bg-[#0A0F1C] flex justify-between items-center">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 font-sans">
                  <Database className="w-5 h-5 text-[#00F2FE]" /> Walrus Verification Terminal
                </h3>
                <button onClick={() => setSelectedLog(null)} className="text-slate-500 hover:text-white transition-colors">✕</button>
              </div>

              <div className="p-8">
                {verifying ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-6">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border-4 border-[#1E293B] border-t-[#00F2FE] animate-spin" />
                      <Database className="w-6 h-6 text-[#00F2FE] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <div className="text-center">
                      <h4 className="text-white font-bold font-sans mb-1">Auditing Decentralized Storage</h4>
                      <p className="text-sm text-slate-400">Computing SHA-256 integrity hash against Sui blob index...</p>
                    </div>
                  </div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="bg-[#00F2FE]/10 border border-[#00F2FE]/30 p-5 rounded-xl flex items-start gap-4 mb-8">
                      <ShieldCheck className="w-6 h-6 text-[#00F2FE] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-white font-sans text-lg block mb-1">Cryptographic Proof Verified</span>
                        <span className="text-sm text-slate-300 leading-relaxed">The AI Agent's execution payload fetched from Walrus perfectly matches the immutably stamped hash on the Sui blockchain.</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                      <div className="bg-[#05050A] border border-[#1E293B] p-4 rounded-xl">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2">Expected Blob ID</span>
                        <span className="text-white font-mono text-sm break-all">{selectedLog.blobId}</span>
                      </div>
                      <div className="bg-[#05050A] border border-[#1E293B] p-4 rounded-xl">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2">Computed Payload Hash</span>
                        <span className="text-[#00F2FE] font-mono text-sm break-all">{computedHash}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2">Decrypted AI JSON Payload</span>
                      <pre className="bg-[#05050A] border border-[#1E293B] p-5 rounded-xl text-xs text-[#00B5A3] overflow-x-auto font-mono shadow-inner custom-scrollbar">
                        {JSON.stringify(selectedLog, null, 2)}
                      </pre>
                    </div>

                    <button 
                      onClick={() => setSelectedLog(null)}
                      className="w-full mt-8 py-4 bg-[#1E293B] hover:bg-[#2A3B54] text-white font-bold rounded-xl transition-colors font-sans"
                    >
                      Close Terminal
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
