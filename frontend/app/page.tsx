"use client";

import React from 'react';
import Link from 'next/link';
import { ConnectButton } from '@mysten/dapp-kit';
import { Shield, Database, Cpu, ExternalLink, ArrowRight } from 'lucide-react';
import { motion, Variants } from 'framer-motion';

import { officialVaults } from '../lib/config/vaults';

export default function LandingPage() {
  const vaults = officialVaults;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="flex-grow flex flex-col relative min-h-screen">
      {/* Dynamic Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#00F2FE]/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#B829EA]/10 blur-[120px]" />
      </div>

      {/* Header / Nav */}
      <header className="border-b border-[#1E293B] bg-[#05050A]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00F2FE] to-[#00B5A3] flex items-center justify-center font-bold text-[#05050A] shadow-lg shadow-[#00F2FE]/20">S</span>
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
              Sui<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00F2FE] to-[#B829EA]">Syndicate</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300 font-sans">
            <Link href="#vaults" className="hover:text-[#00F2FE] transition-colors">Browse Vaults</Link>
            <a href="https://walrus.xyz" target="_blank" rel="noreferrer" className="hover:text-[#B829EA] flex items-center gap-1.5 transition-colors">
              Walrus Storage <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20 flex flex-col items-center justify-center text-center relative z-10 w-full">
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#00F2FE]/30 bg-[#00F2FE]/10 text-xs font-semibold text-[#00F2FE] mb-8 shadow-[0_0_15px_rgba(0,242,254,0.15)]"
        >
          <span className="w-2 h-2 rounded-full bg-[#00F2FE] animate-pulse" />
          Tatum x Walrus Hackathon Submission
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.1] max-w-5xl font-sans"
        >
          Autonomous <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00F2FE] via-[#00B5A3] to-[#B829EA] text-neon-glow">AI-Agent Vaults</span> on Sui
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-lg md:text-xl text-slate-400 max-w-2xl mb-12 leading-relaxed font-sans"
        >
          The trustless protocol for AI-run portfolios. Smart contracts protect assets. Agents execute trades. Walrus keeps the permanent, cryptographic audit trail.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-6 mb-16 sm:mb-24"
        >
          <Link href="#vaults" className="px-8 py-4 btn-premium rounded-xl text-lg flex items-center justify-center gap-2 group">
            Browse Official Vaults 
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>

        {/* Feature Grid */}
        <motion.section 
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 w-full max-w-5xl mb-20 sm:mb-32 text-left"
        >
          <motion.div variants={itemVariants} className="glass-panel p-6 sm:p-8 hover:-translate-y-1 transition-transform duration-300">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00F2FE]/20 to-[#00B5A3]/10 flex items-center justify-center text-[#00F2FE] mb-6 border border-[#00F2FE]/20 shadow-[0_0_20px_rgba(0,242,254,0.1)]">
              <Shield className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3 font-sans">On-Chain Spend Limits</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Every agent wallet is gated by a Sui <code className="text-[#00F2FE] bg-[#00F2FE]/10 px-1.5 py-0.5 rounded">AgentCap</code> that strictly controls per-transaction sizes, daily limits, and slippage.
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="glass-panel p-8 hover:-translate-y-1 transition-transform duration-300">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#B829EA]/20 to-[#00F2FE]/10 flex items-center justify-center text-[#B829EA] mb-6 border border-[#B829EA]/20 shadow-[0_0_20px_rgba(184,41,234,0.1)]">
              <Database className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3 font-sans">Permanent Walrus Audit</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Every rebalancing transaction is uploaded as a structured JSON action log containing trade specs and AI reasoning, permanently archived on Walrus.
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="glass-panel p-8 hover:-translate-y-1 transition-transform duration-300">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00B5A3]/20 to-[#00F2FE]/10 flex items-center justify-center text-[#00B5A3] mb-6 border border-[#00B5A3]/20 shadow-[0_0_20px_rgba(0,181,163,0.1)]">
              <Cpu className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3 font-sans">DeepSeek Intelligence</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Decision logic runs via DeepSeek's advanced reasoning models, analyzing real-time prices via Tatum RPC to optimize portfolio allocations.
            </p>
          </motion.div>
        </motion.section>

        {/* Vault List Section */}
        <section id="vaults" className="w-full max-w-5xl text-left border-t border-[#1E293B] pt-20 pb-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl font-extrabold text-white mb-4 font-sans">Active Syndicates</h2>
            <p className="text-slate-400 mb-10 text-lg">Select a vault to view portfolio state, deposit assets, or inspect the live Walrus verification logs.</p>
          </motion.div>

          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {vaults.length === 0 ? (
              <div className="col-span-1 md:col-span-2 py-16 text-center border border-dashed border-[#1E293B] rounded-2xl glass-panel text-slate-500">
                No active vaults found on Mainnet.
              </div>
            ) : (
              vaults.map((vault) => (
                <motion.div variants={itemVariants} key={vault.id}>
                  <Link href={`/vaults/${vault.id}`} className="glass-panel-glow flex flex-col justify-between p-8 relative overflow-hidden group block h-full">
                    {/* Background glow effect on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[#00F2FE]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-2xl font-bold text-white font-sans">{vault.name}</h3>
                        <span className="px-3 py-1 bg-[#00F2FE]/10 border border-[#00F2FE]/20 rounded-full text-xs font-bold text-[#00F2FE] flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00F2FE] animate-pulse" /> Live
                        </span>
                      </div>
                      
                      <p className="text-slate-400 text-sm mb-6 flex-grow leading-relaxed">{vault.description}</p>
                      
                      <div className="mt-auto">
                        <div className="text-[#B829EA] text-sm font-semibold mb-6 flex items-center gap-2">
                          <Cpu className="w-4 h-4" /> Managed by DeepSeek AI
                        </div>
                        <div className="flex items-center text-[#00F2FE] font-bold text-sm group-hover:gap-2 transition-all">
                          View Details & Deposit <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))
            )}
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-[#1E293B] bg-[#05050A]/90 backdrop-blur py-8 text-center text-slate-500 text-sm">
        <p>© 2026 SuiSyndicate Vault Protocol. Powered by Tatum Sui RPC and Walrus Decentralized Storage.</p>
      </footer>
    </div>
  );
}
