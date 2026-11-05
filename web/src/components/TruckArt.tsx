import clsx from 'clsx';
import truckPhoto from '../assets/truck.jpg';

/**
 * Фото трака. Фон снимка белый — mix-blend-multiply делает его прозрачным
 * на светлых карточках, а тень под колёсами ложится естественно.
 * Чтобы поставить свой трак с логотипом, замените web/src/assets/truck.jpg.
 */
export function TruckArt({ className, kind }: { className?: string; kind?: string; brand?: string; small?: boolean }) {
  return <img src={truckPhoto} alt={kind ? `Трак · ${kind}` : 'Трак'} draggable={false} className={clsx('select-none object-contain mix-blend-multiply', className)} />;
}
