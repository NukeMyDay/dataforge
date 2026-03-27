interface Props {
  message?: string;
}

export default function ErrorMessage({ message = "Something went wrong. Please try again." }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-gray-600">{message}</p>
    </div>
  );
}
