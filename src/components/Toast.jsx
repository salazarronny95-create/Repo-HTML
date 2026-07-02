import { useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';
import './Toast.css';

export default function Toast({ message, visible, onClose }) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="toast" role="alert" aria-live="polite">
      <CheckCircle size={20} />
      <span className="toast__message">{message}</span>
      <button className="toast__close" onClick={onClose} aria-label="Cerrar notificación">
        <X size={16} />
      </button>
    </div>
  );
}