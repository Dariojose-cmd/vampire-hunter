import styles from './GarlicHint.module.css';

interface GarlicHintProps {
  id: string;
  text: string;
}

/** Always-visible explanation of the garlic (reminder) button; touch friendly. */
export function GarlicHint({ id, text }: GarlicHintProps) {
  return (
    <p id={id} className={styles.hint}>
      {text}
    </p>
  );
}

export default GarlicHint;
