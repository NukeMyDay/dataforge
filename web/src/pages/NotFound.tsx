import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
      <div className="text-6xl mb-4">404</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h1>
      <p className="text-gray-500 mb-8">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn-primary">Back to Home</Link>
    </div>
  );
}
