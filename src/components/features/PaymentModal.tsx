import { useState } from 'react';
import { X, Upload, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { AppSettings } from '@/types';
import UploadProgress from '@/components/features/UploadProgress';

interface PaymentModalProps {
  onClose: () => void;
  amount: number;
  planName: string;
  type: string;
  settings: AppSettings;
  onSuccess?: () => void;
}

export default function PaymentModal({ onClose, amount, planName, type, settings, onSuccess }: PaymentModalProps) {
  const { user } = useAuth();
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [step, setStep] = useState<'info' | 'upload' | 'done'>('info');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshot(file);
    setPreview(URL.createObjectURL(file));
    setStep('upload');
  };

  const handleSubmit = async () => {
    if (!screenshot || !user) return;
    setUploading(true);
    setUploadPct(0);
    try {
      const ext = screenshot.name.split('.').pop() || 'jpg';
      const path = `screenshots/${user.id}/${Date.now()}.${ext}`;
      let screenshotUrl = '';

      try {
        const { uploadFile } = await import('@/lib/supabase');
        screenshotUrl = await uploadFile('transactions', path, screenshot, (pct) => setUploadPct(pct));
      } catch {
        // Fallback
        const { error } = await supabase.storage.from('transactions').upload(path, screenshot, { upsert: true });
        if (!error) {
          const { data: urlData } = supabase.storage.from('transactions').getPublicUrl(path);
          screenshotUrl = urlData.publicUrl;
        } else {
          screenshotUrl = preview;
        }
      }

      await supabase.from('transactions').insert({
        user_id: user.id, amount, type, status: 'pending',
        screenshot_url: screenshotUrl, description: planName, plan_name: planName,
      });

      // Notify ALL admins about new payment
      await supabase.from('notifications').insert({
        title: '💰 Ombi Jipya la Malipo!',
        message: `${planName} - TZS ${amount.toLocaleString()} - Angalia transactions`,
        type: 'payment_request',
        link: '/admin',
        user_id: null, // null = broadcast, but we filter by type for admin
      });

      // Also insert specifically for admins who have user_id
      const { data: admins } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('is_admin', true);
      if (admins && admins.length > 0) {
        await Promise.all(admins.map((admin: any) =>
          supabase.from('notifications').insert({
            user_id: admin.id,
            title: '💰 Ombi Jipya la Malipo!',
            message: `${planName} - TZS ${amount.toLocaleString()} - Bonyeza kuona`,
            type: 'payment_request',
            link: '/admin',
          })
        ));
      }

      setStep('done');
      toast.success('Ombi limetumwa! Admin atakagua hivi karibuni.');
      onSuccess?.();
    } catch (err) {
      console.error(err);
      toast.error('Hitilafu! Jaribu tena.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold text-lg">Malipo - {planName}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {step === 'done' ? (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h3 className="text-white font-bold text-xl mb-2">Ombi Limetumwa!</h3>
            <p className="text-gray-400 text-sm mb-6">Admin atakagua na kuthibitisha hivi karibuni.</p>
            <button onClick={onClose} className="btn-primary w-full">Sawa</button>
          </div>
        ) : (
          <>
            <div className="balance-card mb-4">
              <p className="text-white/70 text-sm">Kiasi cha kulipa</p>
              <p className="text-white font-black text-3xl">TZS {amount.toLocaleString()}</p>
            </div>

            <div className="gradient-card rounded-xl p-4 mb-4">
              <p className="text-primary font-semibold mb-2">Hatua za malipo:</p>
              <ol className="text-gray-300 text-sm space-y-1.5">
                <li>1. Tuma <span className="text-primary font-bold">TZS {amount.toLocaleString()}</span> kwenye:</li>
                <li className="pl-4">
                  <span className="text-white font-bold">{settings.payment_network || 'TIGOPESA'}</span><br />
                  Namba: <span className="text-primary font-bold">{settings.payment_number || '+255655299602'}</span><br />
                  Jina: <span className="text-white">{settings.payment_name || 'MONICA MGAJI'}</span>
                </li>
                <li>2. Piga screenshot ya muamala</li>
                <li>3. Upload screenshot hapa chini na tuma ombi</li>
              </ol>
            </div>

            {/* Screenshot area */}
            {preview ? (
              <div className="mb-3 relative rounded-xl overflow-hidden border border-primary/30 cursor-pointer"
                onClick={() => document.getElementById('pm-screenshot')?.click()}>
                <img src={preview} alt="Screenshot" className="w-full object-cover max-h-48" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <p className="text-white font-bold text-sm">Bonyeza kubadilisha</p>
                </div>
              </div>
            ) : (
              <label className="block mb-3" htmlFor="pm-screenshot">
                <div className="btn-outline w-full text-center cursor-pointer flex items-center justify-center gap-2 py-3">
                  <Upload className="w-5 h-5" />Upload Screenshot ya Muamala
                </div>
              </label>
            )}
            <input id="pm-screenshot" type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

            {uploading && <div className="mb-3"><UploadProgress progress={uploadPct} fileSize={screenshot?.size} fileName={screenshot?.name} /></div>}

            {step === 'upload' && (
              <button onClick={handleSubmit} disabled={uploading || !screenshot}
                className="btn-primary w-full disabled:opacity-50">
                {uploading ? `Inapakia ${uploadPct}%...` : 'Tuma Ombi'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
