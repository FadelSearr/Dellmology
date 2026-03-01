'use client'

import { useState } from 'react'
import { Save, AlertTriangle, Bell } from 'lucide-react'

interface AlertThreshold {
  symbol: string
  min_accuracy: number
  max_loss: number
  alert_on_retrain_failure: boolean
  notify_email?: string
  notify_telegram?: boolean
}

export default function ModelAlertThresholds({ symbol = 'BBCA' }: { symbol?: string }) {
  const [thresholds, setThresholds] = useState<AlertThreshold>({
    symbol: symbol,
    min_accuracy: 80,
    max_loss: 0.15,
    alert_on_retrain_failure: true,
    notify_telegram: true,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const resp = await fetch('/api/model-alerts/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds),
      })
      if (resp.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (e) {
      console.error('Failed to save thresholds', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-linear-to-br from-orange-900/20 to-gray-900/30 border border-orange-700/40 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-orange-400" />
          <h3 className="text-sm font-semibold text-white">Alert Thresholds</h3>
        </div>
        <span className="text-xs text-gray-400">{symbol}</span>
      </div>

      <div className="space-y-3 text-sm">
        {/* Min Accuracy Threshold */}
        <div>
          <label className="text-gray-400 mb-1 block">Minimum Accuracy: {thresholds.min_accuracy}%</label>
          <input
            type="range"
            min="50"
            max="99"
            step="1"
            value={thresholds.min_accuracy}
            onChange={(e) => setThresholds({ ...thresholds, min_accuracy: parseInt(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="text-xs text-gray-500 mt-1">Alert if validation accuracy drops below this level</div>
        </div>

        {/* Max Loss Threshold */}
        <div>
          <label className="text-gray-400 mb-1 block">Maximum Loss: {thresholds.max_loss.toFixed(3)}</label>
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={thresholds.max_loss}
            onChange={(e) => setThresholds({ ...thresholds, max_loss: parseFloat(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="text-xs text-gray-500 mt-1">Alert if training loss exceeds this value</div>
        </div>

        {/* Retrain Failure Alert */}
        <div className="flex items-center gap-2 py-2 px-2 bg-gray-900/40 rounded border border-gray-700">
          <input
            type="checkbox"
            id="alert_retrain_fail"
            checked={thresholds.alert_on_retrain_failure}
            onChange={(e) => setThresholds({ ...thresholds, alert_on_retrain_failure: e.target.checked })}
            className="w-4 h-4"
          />
          <label htmlFor="alert_retrain_fail" className="text-gray-300 cursor-pointer">Alert if retrain fails</label>
        </div>

        {/* Notification Method */}
        <div className="border-t border-gray-700 pt-2">
          <label className="text-gray-400 text-xs mb-2 block">Notification Methods</label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notify_telegram"
                checked={thresholds.notify_telegram}
                onChange={(e) => setThresholds({ ...thresholds, notify_telegram: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="notify_telegram" className="text-gray-300 cursor-pointer text-sm">Send Telegram alert</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notify_email"
                defaultChecked={false}
                onChange={(e) => setThresholds({ ...thresholds, notify_email: e.target.checked ? 'ops@example.com' : undefined })}
                className="w-4 h-4"
              />
              <label htmlFor="notify_email" className="text-gray-300 cursor-pointer text-sm">Send email alert</label>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded text-sm font-medium"
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Thresholds'}
        </button>
        {saved && (
          <div className="flex items-center gap-1 px-3 py-2 bg-green-500/10 border border-green-700/50 rounded text-xs text-green-300">
            <Bell size={12} />
            Saved
          </div>
        )}
      </div>

      {/* Active Alerts Info */}
      <div className="text-xs text-gray-500 bg-gray-900/30 rounded p-2">
        <div className="font-semibold mb-1">Current Configuration:</div>
        <div>• Alert if accuracy &lt; {thresholds.min_accuracy}%</div>
        <div>• Alert if loss &gt; {thresholds.max_loss.toFixed(3)}</div>
        <div>• Retrain failures: {thresholds.alert_on_retrain_failure ? 'Monitored' : 'Ignored'}</div>
      </div>
    </div>
  )
}
