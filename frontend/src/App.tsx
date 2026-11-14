import { AppRoutes } from './app/AppRoutes';
import { Providers } from './app/Providers';

export default function App() {
  return (
    <Providers>
      <AppRoutes />
    </Providers>
  );
}
