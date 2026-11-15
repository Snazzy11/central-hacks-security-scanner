import { AppRoutes } from './app/AppRoutes';
import { Providers } from './app/Providers';

export default function App() {
  return (
    <>
      <head>
        <link rel="icon" type="image/png" href="../logo/favicon.ico" />
      </head>
      <Providers>
        <AppRoutes />
      </Providers>
    </>
  );
}
