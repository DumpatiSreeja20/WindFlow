import React, { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, Download, RefreshCw, Wind, Zap } from 'lucide-react'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const fmt = (n) => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: 1 })
const shortDate = (value) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}
function Metric({ label, value, unit, icon: Icon, note }) {
  return <article className="metric"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={18}/></span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-note">{note}</div></article>
}
function App() {
  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState('2026-01-07')
  const [demo, setDemo] = useState(true)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const url = `${API}/api/dashboard?start_date=${startDate}&end_date=${endDate}&demo=${demo}`
      const res = await fetch(url)
      const body = await res.json()
      if (!res.ok) throw new Error(body.detail || 'Unable to load data')
      setData(body)
    } catch (e) {
      setError(`${e.message}. You can switch to Demo mode to explore the dashboard.`)
      setData(null)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const chartData = useMemo(() => (data?.rows || []).map((r) => ({
    ...r, timeLabel: shortDate(r.startTime), actual: r.actualGeneration, forecast: r.forecastGeneration
  })), [data])
  const exportCsv = () => {
    const rows = data?.rows || []
    if (!rows.length) return
    const headers = ['startTime','publishTime','actualGeneration','forecastGeneration','error','absoluteError']
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = 'windflow-analysis.csv'; a.click(); URL.revokeObjectURL(url)
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Wind size={23}/></div><div><b>WindFlow</b><span>FORECAST INTELLIGENCE</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${tab==='overview'?'active':''}`} onClick={()=>setTab('overview')}><Activity size={18}/> Overview</button>
      <button className={`nav-item ${tab==='accuracy'?'active':''}`} onClick={()=>setTab('accuracy')}><Zap size={18}/> Forecast accuracy</button>
      <div className="sidebar-bottom"><div className="status-dot"></div><div><b>Data workspace</b><span>UK · National wind</span></div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">ENERGY PROCUREMENT / ANALYTICS</div><h1>{tab==='overview'?'Wind generation overview':'Forecast accuracy analysis'}</h1><p>Understand forecast availability and quantify uncertainty before procurement decisions.</p></div><div className="topbar-right"><span className={`source-pill ${data?.source==='live'?'live':''}`}><span className="pill-dot"></span>{data?.source==='live'?'Elexon live data':data?.source==='demo'?'Synthetic demo data':'Awaiting data'}</span><button className="icon-button" onClick={load} title="Refresh data"><RefreshCw size={17} className={loading?'spin':''}/></button></div></header>
      <section className="filter-bar">
        <div className="filter-title"><CalendarDays size={17}/><span>Analysis period</span></div>
        <label>From <input type="date" min="2026-01-01" max="2026-01-31" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label>To <input type="date" min={startDate} max="2026-01-31" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        <label className="demo-toggle"><input type="checkbox" checked={demo} onChange={e=>setDemo(e.target.checked)}/> Demo data</label>
        <button className="primary-button" onClick={load} disabled={loading}>{loading?<RefreshCw size={16} className="spin"/>:<Activity size={16}/>} {loading?'Loading':'Run analysis'}</button>
      </section>
      {error && <div className="error-banner"><AlertTriangle size={18}/><span>{error}</span></div>}
      {data?.source==='demo' && <div className="demo-banner"><AlertTriangle size={17}/><span><b>Demo mode:</b> synthetic values are shown for interface demonstration only. They are not official Elexon measurements.</span></div>}
      <div className="section-heading"><div><h2>Decision snapshot</h2><p>National wind generation · Half-hourly periods</p></div><span className="date-range">{startDate} — {endDate}</span></div>
      <section className="metrics-grid">
        <Metric label="Matched periods" value={fmt(data?.matchedPeriods)} unit="" icon={CheckCircle2} note="Actual + selected forecast"/>
        <Metric label="Mean absolute error" value={fmt(data?.mae)} unit=" MW" icon={Activity} note="Lower is better"/>
        <Metric label="Root mean square error" value={fmt(data?.rmse)} unit=" MW" icon={Zap} note="Penalises larger misses"/>
        <Metric label="Forecast bias" value={fmt(data?.bias)} unit=" MW" icon={data?.bias >= 0 ? ArrowUpRight : ArrowDownRight} note="Positive = over-forecast"/>
      </section>
      <section className="content-grid">
        <article className="panel chart-panel"><div className="panel-header"><div><h3>Forecast vs actual generation</h3><p>Wind power output over the selected period</p></div><span className="unit-tag">MW</span></div>
          <div className="chart-wrap">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:12,left:0,bottom:0}}><defs><linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36b8a1" stopOpacity={0.2}/><stop offset="95%" stopColor="#36b8a1" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8eef3"/><XAxis dataKey="timeLabel" tick={{fontSize:10,fill:'#718096'}} interval={Math.max(0,Math.floor(chartData.length/7)-1)} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#718096'}} axisLine={false} tickLine={false} width={58}/><Tooltip labelFormatter={v=>v} formatter={(v,n)=>[`${fmt(v)} MW`,n==='actual'?'Actual generation':'Forecast generation']}/><Legend/><Area type="monotone" dataKey="forecast" name="Forecast" stroke="#20a58e" strokeWidth={2} fill="url(#forecastFill)" dot={false}/><Line type="monotone" dataKey="actual" name="Actual" stroke="#5478dc" strokeWidth={2} dot={false}/></AreaChart></ResponsiveContainer> : <div className="empty-state"><Activity size={30}/><b>{loading?'Loading analysis…':'No matched data available'}</b><span>Run analysis or use demo mode to preview the dashboard.</span></div>}</div>
          <div className="chart-footer"><span><i className="legend-dot teal"></i> Forecast generation</span><span><i className="legend-dot blue"></i> Actual generation</span><button className="text-button" onClick={exportCsv} disabled={!chartData.length}><Download size={15}/> Export CSV</button></div>
        </article>
        <article className="panel insight-panel"><div className="panel-header"><div><h3>Data readiness</h3><p>Source coverage for this period</p></div><span className="small-icon"><CheckCircle2 size={18}/></span></div>
          <div className="readiness-row"><div><span>Actual records</span><b>{fmt(data?.actualCount)}</b></div><div className="progress-track"><div className="progress-fill blue-fill" style={{width:`${Math.min(100,(data?.actualCount||0)/Math.max(1,data?.actualCount||0,data?.forecastCount||0)*100)}%`}}/></div></div>
          <div className="readiness-row"><div><span>Forecast records</span><b>{fmt(data?.forecastCount)}</b></div><div className="progress-track"><div className="progress-fill teal-fill" style={{width:`${Math.min(100,(data?.forecastCount||0)/Math.max(1,data?.actualCount||0,data?.forecastCount||0)*100)}%`}}/></div></div>
          <div className="divider"></div><div className="info-block"><span className="info-label">Latest forecast publication</span><b>{data?.latestPublishTime ? new Date(data.latestPublishTime).toLocaleString('en-GB') : 'Not available'}</b><p>Publication timestamps help establish which forecast was available at decision time.</p></div>
          <div className="info-block"><span className="info-label">Procurement context</span><b>Day-ahead market</b><p>Compare expected wind supply with demand forecasts and other generation before deciding additional procurement.</p></div>
        </article>
      </section>
      <section className="panel table-panel"><div className="panel-header"><div><h3>Period-level forecast comparison</h3><p>Selected forecast matched to each actual half-hourly period</p></div><button className="text-button" onClick={exportCsv} disabled={!chartData.length}><Download size={15}/> Export</button></div>
        <div className="table-overflow"><table><thead><tr><th>Delivery period</th><th>Forecast published</th><th>Actual (MW)</th><th>Forecast (MW)</th><th>Error (MW)</th><th>Absolute error</th></tr></thead><tbody>{(data?.rows||[]).slice(0,12).map((r,i)=><tr key={r.startTime+i}><td>{shortDate(r.startTime)}</td><td>{r.publishTime?shortDate(r.publishTime):'—'}</td><td>{fmt(r.actualGeneration)}</td><td>{fmt(r.forecastGeneration)}</td><td className={r.error>0?'error-positive':r.error<0?'error-negative':''}>{fmt(r.error)}</td><td>{fmt(r.absoluteError)}</td></tr>)}</tbody></table>{!data?.rows?.length && <div className="table-empty">No matched periods to display.</div>}</div><div className="table-bottom">Showing up to 12 periods · Metrics use all matched periods</div>
      </section>
      <footer>WindFlow pilot · Elexon FUELHH + WINDFOR · Validate source parameters and day-ahead cutoff before operational use.</footer>
    </main>
  </div>
}
export default App
