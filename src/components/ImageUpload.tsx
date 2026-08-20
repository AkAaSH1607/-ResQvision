import { useState, useRef, useCallback } from 'react';
import { Upload, Image as ImageIcon, X, Info } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

interface Props {
  onImageLoaded: (file: File) => void;
  label?: string;
  accept?: string;
  currentFile?: File | null;
}

const SAMPLE_URLS = [
  {
    label: 'INSAT Thermal (India)',
    url: 'https://images.pexels.com/photos/87651/earth-blue-planet-globe-planet-87651.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    label: 'Landsat IR (Desert)',
    url: 'https://images.pexels.com/photos/1169754/pexels-photo-1169754.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    label: 'Satellite Cloud',
    url: 'https://images.pexels.com/photos/209831/pexels-photo-209831.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
];

async function urlToFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

export default function ImageUpload({ onImageLoaded, label = 'Upload IR Satellite Image', accept = 'image/*', currentFile }: Props) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    onImageLoaded(file);
  }, [onImageLoaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const loadSample = async (url: string, filename: string) => {
    setLoadingSample(url);
    try {
      const file = await urlToFile(url, filename);
      handleFile(file);
    } catch {
      // ignore
    }
    setLoadingSample(null);
  };

  return (
    <div className="space-y-3">
      <div
        onDragEnter={() => setDragging(true)}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
          dragging
            ? 'border-accent-orange bg-accent-orange/10 scale-[1.01]'
            : currentFile
            ? 'border-accent-blue/60 bg-accent-blue/5'
            : 'border-satellite-border hover:border-slate-500 bg-satellite-bg/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={onInputChange}
        />
        <div className="p-6 flex flex-col items-center gap-3">
          {currentFile ? (
            <>
              <div className="w-10 h-10 rounded-lg bg-accent-blue/20 flex items-center justify-center">
                <ImageIcon size={20} className="text-accent-blue" />
              </div>
              <div className="text-center">
                <div className="text-sm text-slate-200 font-medium">{currentFile.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {(currentFile.size / 1024).toFixed(0)} KB — {t('cp.clickReplace')}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${dragging ? 'bg-accent-orange/20' : 'bg-satellite-card'}`}>
                <Upload size={22} className={dragging ? 'text-accent-orange' : 'text-slate-400'} />
              </div>
              <div className="text-center">
                <div className="text-sm text-slate-300">{label}</div>
                <div className="text-xs text-slate-500 mt-1">PNG, JPG, TIFF — drag & drop or click</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sample images */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Info size={10} className="text-slate-500" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('cp.sampleImages')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_URLS.map(s => (
            <button
              key={s.url}
              onClick={() => loadSample(s.url, s.label.replace(/ /g, '_') + '.jpg')}
              disabled={loadingSample === s.url}
              className="px-2.5 py-1 text-[11px] rounded-lg bg-satellite-card border border-satellite-border text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-all disabled:opacity-50"
            >
              {loadingSample === s.url ? '...' : s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
