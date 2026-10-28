import { useState } from 'react';
import { BookOpen, Layers, Upload, Sparkles } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui';
import { useI18n } from '../i18n';
import { useApp } from './AppContext';
import { useDialogs } from './Dialogs';
import { loadSample } from '../sample/sample';
import { navigate, routes } from './router';

/** İlk kullanım: 3 adımlı, atlanabilir tanıtım. Hesap, e-posta veya ödeme istenmez. */
export function Onboarding() {
  const { t } = useI18n();
  const { settings, updateSettings, reportError } = useApp();
  const { openImport } = useDialogs();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const open = !settings.onboardingDone;

  const finish = () => void updateSettings({ onboardingDone: true });

  const steps = [
    { icon: Upload, title: t('onboarding.s1Title'), text: t('onboarding.s1Text') },
    { icon: BookOpen, title: t('onboarding.s2Title'), text: t('onboarding.s2Text') },
    { icon: Layers, title: t('onboarding.s3Title'), text: t('onboarding.s3Text') },
  ];
  const s = steps[step];
  const Icon = s.icon;
  const last = step === steps.length - 1;

  const trySample = async () => {
    setBusy(true);
    try {
      const id = await loadSample();
      finish();
      navigate(routes.read(id));
    } catch (e) {
      reportError(e, 'sample');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={finish} title={t('onboarding.title')} description={t('onboarding.subtitle')} size="md">
      <div className="onboarding">
        <ol className="steps-dots" aria-label={t('onboarding.progress', { n: step + 1, total: steps.length })}>
          {steps.map((x, i) => (
            <li key={x.title} className={i === step ? 'active' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="sr-only">{x.title}</span>
            </li>
          ))}
        </ol>
        <div className="onboarding-step" aria-live="polite">
          <div className="onboarding-icon" aria-hidden="true">
            <Icon size={30} />
          </div>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </div>
        {last ? (
          <div className="onboarding-actions">
            <Button variant="primary" icon={Sparkles} loading={busy} onClick={() => void trySample()}>
              {t('onboarding.trySample')}
            </Button>
            <Button
              variant="secondary"
              icon={Upload}
              onClick={() => {
                finish();
                openImport('file');
              }}
            >
              {t('onboarding.addOwn')}
            </Button>
            <Button variant="ghost" onClick={finish}>
              {t('onboarding.later')}
            </Button>
            <p className="field-hint">{t('onboarding.sampleNote')}</p>
          </div>
        ) : (
          <div className="onboarding-actions row-between">
            <Button variant="ghost" onClick={finish}>
              {t('onboarding.skip')}
            </Button>
            <Button variant="primary" onClick={() => setStep(step + 1)} data-autofocus>
              {t('common.next')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
