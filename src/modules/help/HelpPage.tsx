import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import { Card, Kbd } from '../../components/ui';
import { routes } from '../../app/router';
import { ERROR_CODES } from '../../domain/errors';

export default function HelpPage() {
  const { t } = useI18n();
  const { settings, updateSettings } = useApp();
  const sc = settings.shortcuts;
  const loop = ['add', 'read', 'understand', 'connect', 'remember', 'apply', 'restudy'];
  return (
    <div className="page page-help">
      <header className="page-header">
        <div>
          <h1>{t('help.title')}</h1>
          <p className="page-sub">{t('help.subtitle')}</p>
        </div>
      </header>
      <div className="help-grid">
        <Card>
          <h2 className="card-title">{t('help.loopTitle')}</h2>
          <ol className="loop">
            {loop.map((k) => (
              <li key={k}>
                <strong>{t(`help.loop.${k}`)}</strong> — {t(`help.loopText.${k}`)}
              </li>
            ))}
          </ol>
          <p className="field-hint">{t('help.loopNote')}</p>
        </Card>
        <Card>
          <h2 className="card-title">{t('help.scheduleTitle')}</h2>
          <p>{t('help.schedule1')}</p>
          <ul>
            <li>{t('help.schedule2')}</li>
            <li>{t('help.schedule3')}</li>
            <li>{t('help.schedule4')}</li>
            <li>{t('help.schedule5')}</li>
          </ul>
          <p className="field-hint">{t('help.scheduleNote')}</p>
        </Card>
        <Card>
          <h2 className="card-title">{t('help.keysTitle')}</h2>
          <ul className="keys">
            <li>
              <Kbd>{sc.search}</Kbd> {t('shortcuts.search')}
            </li>
            <li>
              <Kbd>{sc.nextParagraph}</Kbd> / <Kbd>{sc.prevParagraph}</Kbd> {t('help.keysParagraph')}
            </li>
            <li>
              <Kbd>Enter</Kbd> {t('help.keysActions')}
            </li>
            <li>
              <Kbd>{sc.highlight}</Kbd> {t('shortcuts.highlight')} · <Kbd>{sc.addNote}</Kbd> {t('shortcuts.addNote')} · <Kbd>{sc.createCard}</Kbd> {t('shortcuts.createCard')}
            </li>
            <li>
              <Kbd>{sc.showAnswer}</Kbd> {t('shortcuts.showAnswer')} · <Kbd>{sc.rateAgain}</Kbd>–<Kbd>{sc.rateEasy}</Kbd> {t('help.keysRate')}
            </li>
            <li>
              <Kbd>{sc.goHome}</Kbd>, <Kbd>{sc.goLibrary}</Kbd>, <Kbd>{sc.goReview}</Kbd>, <Kbd>{sc.goMap}</Kbd> {t('help.keysGo')}
            </li>
          </ul>
          <a href={`#${routes.settings('keyboard')}`}>{t('help.keysCustomize')}</a>
        </Card>
        <Card>
          <h2 className="card-title">{t('help.dataTitle')}</h2>
          <p>{t('help.data1')}</p>
          <p>{t('help.data2')}</p>
          <a href={`#${routes.settings('data')}`}>{t('help.dataLink')}</a>
        </Card>
        <Card>
          <h2 className="card-title">{t('help.formatsTitle')}</h2>
          <p>{t('help.formats1')}</p>
          <p className="field-hint">{t('help.formats2')}</p>
        </Card>
        <Card>
          <h2 className="card-title">{t('help.tourTitle')}</h2>
          <p>{t('help.tourText')}</p>
          <button type="button" className="btn btn-secondary btn-md" onClick={() => void updateSettings({ onboardingDone: false })}>
            {t('help.tourButton')}
          </button>
        </Card>
        <Card className="help-wide">
          <h2 className="card-title">{t('help.errorsTitle')}</h2>
          <table className="error-table">
            <thead>
              <tr>
                <th scope="col">{t('help.code')}</th>
                <th scope="col">{t('help.meaning')}</th>
                <th scope="col">{t('help.whatToDo')}</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_CODES.map((c) => (
                <tr key={c}>
                  <td>
                    <code>{c}</code>
                  </td>
                  <td>{t(`errors.${c}.title`)}</td>
                  <td>{t(`errors.${c}.action`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
