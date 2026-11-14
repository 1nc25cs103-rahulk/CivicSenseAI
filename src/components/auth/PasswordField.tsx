import React, { useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  showStrengthRules?: boolean;
  accent?: 'teal' | 'navy';
}

const PASSWORD_RULE_SPECS = [
  { key: 'auth.password.ruleLength', test: (p: string) => p.length >= 8 },
  { key: 'auth.password.ruleUpper', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'auth.password.ruleLower', test: (p: string) => /[a-z]/.test(p) },
  { key: 'auth.password.ruleNumber', test: (p: string) => /[0-9]/.test(p) },
  { key: 'auth.password.ruleSpecial', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function getPasswordChecks(password: string) {
  return PASSWORD_RULE_SPECS.map((rule) => ({
    key: rule.key,
    met: rule.test(password),
  }));
}

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULE_SPECS.every((rule) => rule.test(password));
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete = 'current-password',
  required = true,
  showStrengthRules = false,
  accent = 'teal',
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const checks = showStrengthRules ? getPasswordChecks(value) : [];
  const metCount = checks.filter((c) => c.met).length;

  const focusClass =
    accent === 'navy'
      ? 'focus:border-slate-900 focus:ring-slate-900/15'
      : 'focus:border-teal-600 focus:ring-teal-600/20';

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t('auth.password.placeholder')}
          className={`w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-11 text-sm text-slate-900 focus:outline-none focus:ring-2 ${focusClass}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={
            visible
              ? t('auth.password.hide', { label })
              : t('auth.password.show', { label })
          }
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {showStrengthRules && (
        <div className="mt-2.5 space-y-2">
          <div className="grid grid-cols-5 gap-1.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((step) => (
              <div
                key={step}
                className={`h-1 rounded-full transition-colors ${
                  metCount >= step
                    ? metCount === 5
                      ? 'bg-emerald-600'
                      : metCount >= 3
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {checks.map((rule) => (
              <li
                key={rule.key}
                className={`flex items-center gap-1.5 text-[11px] ${
                  rule.met ? 'text-emerald-700 font-medium' : 'text-slate-500'
                }`}
              >
                <Check
                  className={`h-3 w-3 shrink-0 ${
                    rule.met ? 'text-emerald-600 opacity-100' : 'text-slate-300 opacity-70'
                  }`}
                />
                <span>{t(rule.key)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
