import { useState } from "react";

interface PasswordInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  autoComplete?: string;
}

/** Password input with a show/hide eye toggle. */
export function PasswordInput({ value, onChange, ...rest }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <input type={show ? "text" : "password"} value={value} onChange={onChange} {...rest} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? "🙈" : "👁️"}
      </button>
    </div>
  );
}
