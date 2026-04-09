'use client';

import { useState } from 'react';

interface DomainResult {
  domain: string;
  blocked: boolean;
  reason?: string;
  httpStatus?: number;
  dnsResolved?: boolean;
  redirectedTo?: string;
  responseTime?: number;
  checkedAt: string;
}

interface CheckResponse {
  success: boolean;
  checked: number;
  blocked: number;
  open: number;
  results: DomainResult[];
  timestamp: string;
}

export default function Home() {
  const [domains, setDomains] = useState('');
  const [results, setResults] = useState<DomainResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const checkDomains = async () => {
    if (!domains.trim()) {
      setError('Lütfen en az bir domain girin');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const domainList = domains
        .split(/[\n,]/)
        .map(d => d.trim())
        .filter(d => d.length > 0);

      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: domainList }),
      });

      const data: CheckResponse = await response.json();

      if (data.success) {
        setResults(data.results);
      } else {
        setError('Kontrol sırasında bir hata oluştu');
      }
    } catch (err) {
      setError('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  const blockedCount = results.filter(r => r.blocked).length;
  const openCount = results.filter(r => !r.blocked).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Domain Engel Kontrol</h1>
              <p className="text-xs text-zinc-500">Türkiye domain erişim kontrolü</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Input Section */}
        <section className="mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Kontrol Edilecek Domainler
            </label>
            <textarea
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="example.com&#10;test.net&#10;site.org"
              className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all resize-none font-mono"
            />
            <p className="text-xs text-zinc-500 mt-2">Her satıra bir domain veya virgülle ayırın</p>

            <button
              onClick={checkDomains}
              disabled={loading}
              className="mt-4 w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:from-zinc-600 disabled:to-zinc-700 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Kontrol Ediliyor...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Kontrol Et
                </>
              )}
            </button>

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>
        </section>

        {/* Results Section */}
        {results.length > 0 && (
          <section>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-zinc-100">{results.length}</div>
                <div className="text-xs text-zinc-500 mt-1">Toplam</div>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{openCount}</div>
                <div className="text-xs text-emerald-400/70 mt-1">Açık</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{blockedCount}</div>
                <div className="text-xs text-red-400/70 mt-1">Engelli</div>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`border rounded-xl p-4 transition-all ${
                    result.blocked
                      ? 'bg-red-500/5 border-red-500/30'
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        result.blocked ? 'bg-red-500/20' : 'bg-emerald-500/20'
                      }`}>
                        {result.blocked ? (
                          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="font-mono font-medium">{result.domain}</div>
                        <div className={`text-xs mt-0.5 ${result.blocked ? 'text-red-400' : 'text-emerald-400'}`}>
                          {result.reason}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${result.blocked ? 'text-red-400' : 'text-emerald-400'}`}>
                        {result.blocked ? 'ENGELLİ' : 'AÇIK'}
                      </div>
                      {result.responseTime && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {result.responseTime}ms
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Extra Details */}
                  <div className="mt-3 pt-3 border-t border-zinc-800/50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500">DNS:</span>
                      <span className={`ml-1 ${result.dnsResolved ? 'text-emerald-400' : 'text-red-400'}`}>
                        {result.dnsResolved ? 'Çözüldü' : 'Başarısız'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">HTTP:</span>
                      <span className="ml-1 text-zinc-300">{result.httpStatus || 'N/A'}</span>
                    </div>
                    {result.redirectedTo && (
                      <div className="col-span-2">
                        <span className="text-zinc-500">Yönlendirme:</span>
                        <span className="ml-1 text-zinc-300 truncate">{result.redirectedTo}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Info Section */}
        <section className="mt-12 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Otomatik Kontrol Kurulumu</h2>
          <div className="space-y-4 text-sm text-zinc-400">
            <div className="bg-zinc-950 rounded-lg p-4 font-mono text-xs">
              <div className="text-zinc-500 mb-2"># Netlify Environment Variables:</div>
              <div><span className="text-orange-400">TELEGRAM_BOT_TOKEN</span>=<span className="text-zinc-500">your_bot_token</span></div>
              <div><span className="text-orange-400">TELEGRAM_CHAT_ID</span>=<span className="text-zinc-500">kullanici_id (grup degil)</span></div>
              <div><span className="text-orange-400">DOMAINS</span>=<span className="text-zinc-500">site1.com,site2.net,site3.org</span></div>
            </div>
            <p>
              Yukarıdaki environment variable'ları Netlify'da ayarladığınızda,
              sistem <strong className="text-zinc-200">her 5 dakikada bir</strong> domainleri otomatik kontrol eder
              ve engel tespit edildiğinde <strong className="text-zinc-200">doğrudan Telegram hesabınıza</strong> bildirim gönderir.
            </p>
            <p className="mt-2">
              <strong className="text-orange-400">Önemli:</strong> Chat ID olarak kendi kullanıcı ID'nizi girin.
              Bunu öğrenmek için Telegram'da <code className="bg-zinc-800 px-1 rounded">@userinfobot</code>'a mesaj atın.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-12">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-xs text-zinc-500">
          Domain Engel Kontrol Botu • Netlify Scheduled Functions ile çalışır
        </div>
      </footer>
    </div>
  );
}
