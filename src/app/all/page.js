import { Catalog } from '../../components/Catalog.js';
import { requestLibrary } from '../../lib/request.js';
import { publicLibrary } from '../../lib/content.js';
export default async function All() { return <Catalog library={publicLibrary(await requestLibrary())} all />; }