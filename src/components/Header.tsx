import sfaLogo from '../assets/sfa-logo.png';

export default function Header() {
  return (
    <header className="flex items-center justify-between font-bold py-4 uppercase">
      <span className="ml-2">LA Metro Ridership App</span>

      <a href="https://www.streetsforall.org">
        <img src={sfaLogo} height={48} width={48} alt="Streets for All logo" />
      </a>
    </header>
  );
}
