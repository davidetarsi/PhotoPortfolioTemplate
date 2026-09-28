import { useParams } from 'react-router';

/** An open album. Filled in plan 4.2. */
export function AlbumScreen() {
  const { slug } = useParams();
  return <h1 className="dash-screen-title">{slug}</h1>;
}
