// Centroids ([lat, lng]) of the 308 Portuguese municipalities, from CAOP/DGT open data via geoapi.pt
// (fetched 2026-09-28). Funchal is set to the city: its official centroid falls at sea because the
// municipality includes the Selvagens islands.
export const municipalities: Record<string, readonly [number, number]> = {
  "Abrantes": [39.4273, -8.1218], "Aguiar da Beira": [40.7825, -7.508], "Alandroal": [38.6033, -7.3694],
  "Albergaria-a-Velha": [40.742, -8.5021], "Albufeira": [37.0927, -8.2463], "Alcanena": [39.4833, -8.7014],
  "Alcobaça": [39.5482, -8.9972], "Alcochete": [38.7503, -8.9507], "Alcoutim": [37.3964, -7.6814],
  "Alcácer do Sal": [38.4056, -8.4858], "Alenquer": [39.0686, -9.0407], "Alfândega da Fé": [41.3496, -6.9494],
  "Alijó": [41.3078, -7.4945], "Aljezur": [37.2835, -8.8564], "Aljustrel": [37.9018, -8.1931],
  "Almada": [38.6404, -9.1863], "Almeida": [40.6277, -6.9536], "Almeirim": [39.1549, -8.5779],
  "Almodôvar": [37.4627, -8.0952], "Alpiarça": [39.2346, -8.5533], "Alter do Chão": [39.2067, -7.7136],
  "Alvaiázere": [39.783, -8.3935], "Alvito": [38.2471, -8.0449], "Amadora": [38.7648, -9.2317],
  "Amarante": [41.2822, -8.0389], "Amares": [41.6515, -8.3466], "Anadia": [40.4472, -8.4062],
  "Angra do Heroísmo": [38.6927, -27.2281], "Ansião": [39.9413, -8.4202],
  "Arcos de Valdevez": [41.9169, -8.3475], "Arganil": [40.224, -7.9969], "Armamar": [41.0869, -7.6782],
  "Arouca": [40.9518, -8.3018], "Arraiolos": [38.7909, -7.875], "Arronches": [39.1041, -7.2564],
  "Arruda dos Vinhos": [38.9809, -9.0977], "Aveiro": [40.6219, -8.609], "Avis": [39.0536, -7.8628],
  "Azambuja": [39.1646, -8.8956], "Baião": [41.1718, -7.9712], "Barcelos": [41.5439, -8.6414],
  "Barrancos": [38.131, -7.0827], "Barreiro": [38.656, -9.0579], "Batalha": [39.6121, -8.7645],
  "Beja": [37.9303, -7.8084], "Belmonte": [40.3224, -7.319], "Benavente": [38.9055, -8.7967],
  "Bombarral": [39.2974, -9.169], "Borba": [38.8354, -7.4618], "Boticas": [41.649, -7.74],
  "Braga": [41.5544, -8.4094], "Bragança": [41.7549, -6.7698], "Cabeceiras de Basto": [41.5403, -7.9385],
  "Cadaval": [39.2377, -9.0657], "Caldas da Rainha": [39.4091, -9.0792], "Calheta": [32.7759, -17.1943],
  "Calheta de São Jorge": [38.5912, -27.9093], "Caminha": [41.8456, -8.7881], "Campo Maior": [39.0127, -7.0932],
  "Cantanhede": [40.3498, -8.6158], "Carrazeda de Ansiães": [41.2296, -7.2714],
  "Carregal do Sal": [40.4526, -7.9933], "Cartaxo": [39.157, -8.7917], "Cascais": [38.724, -9.4299],
  "Castanheira de Pêra": [40.0286, -8.1835], "Castelo Branco": [39.8597, -7.5805],
  "Castelo de Paiva": [41.0047, -8.3244], "Castelo de Vide": [39.4684, -7.5028],
  "Castro Daire": [40.9252, -7.951], "Castro Marim": [37.3333, -7.5615], "Castro Verde": [37.6822, -8.0318],
  "Celorico da Beira": [40.6576, -7.3334], "Celorico de Basto": [41.3995, -8.0565],
  "Chamusca": [39.2272, -8.4089], "Chaves": [41.7576, -7.3906], "Cinfães": [41.0163, -8.0882],
  "Coimbra": [40.2249, -8.4484], "Condeixa-a-Nova": [40.1055, -8.4848], "Constância": [39.444, -8.2921],
  "Coruche": [38.9582, -8.4041], "Corvo": [39.698, -31.1067], "Covilhã": [40.2599, -7.544],
  "Crato": [39.3207, -7.6602], "Cuba": [38.2192, -7.9077], "Câmara de Lobos": [32.6833, -16.9837],
  "Elvas": [38.8893, -7.2616], "Entroncamento": [39.4676, -8.4762], "Espinho": [40.992, -8.6421],
  "Esposende": [41.5487, -8.755], "Estarreja": [40.7717, -8.5564], "Estremoz": [38.8543, -7.614],
  "Fafe": [41.4588, -8.1506], "Faro": [37.0913, -7.9113], "Felgueiras": [41.3491, -8.1918],
  "Ferreira do Alentejo": [38.0942, -8.2286], "Ferreira do Zêzere": [39.7238, -8.332],
  "Figueira da Foz": [40.159, -8.7921], "Figueira de Castelo Rodrigo": [40.8566, -6.9605],
  "Figueiró dos Vinhos": [39.9058, -8.2877], "Fornos de Algodres": [40.6495, -7.516],
  "Freixo de Espada à Cinta": [41.1409, -6.8466], "Fronteira": [39.0728, -7.6503], "Funchal": [32.65, -16.9083],
  "Fundão": [40.1042, -7.473], "Gavião": [39.4545, -7.8978], "Golegã": [39.3808, -8.5236],
  "Gondomar": [41.0901, -8.4627], "Gouveia": [40.4934, -7.5912], "Grândola": [38.1416, -8.562],
  "Guarda": [40.5057, -7.2222], "Guimarães": [41.44, -8.3079], "Góis": [40.0875, -8.0805],
  "Horta": [38.5682, -28.6951], "Idanha-a-Nova": [39.9368, -7.203], "Lagoa": [37.1029, -8.4429],
  "Lagoa (Açores)": [37.7341, -25.5349], "Lagos": [37.1082, -8.7099], "Lajes das Flores": [39.4168, -31.2333],
  "Lajes do Pico": [38.4106, -28.1789], "Lamego": [41.0602, -7.833], "Leiria": [39.7218, -8.801],
  "Lisboa": [38.768, -9.1603], "Loulé": [37.2326, -8.0215], "Loures": [38.8665, -9.155],
  "Lourinhã": [39.2493, -9.2604], "Lousada": [41.2809, -8.2709], "Lousã": [40.1266, -8.228],
  "Macedo de Cavaleiros": [41.5366, -6.8993], "Machico": [32.7473, -16.7527], "Madalena": [38.489, -28.4925],
  "Mafra": [38.9593, -9.2915], "Maia": [41.2427, -8.5989], "Mangualde": [40.6052, -7.6903],
  "Manteigas": [40.4029, -7.5069], "Marco de Canaveses": [41.1833, -8.1553],
  "Marinha Grande": [39.7507, -8.9527], "Marvão": [39.4061, -7.386], "Matosinhos": [41.2234, -8.6893],
  "Mação": [39.6042, -7.9495], "Mealhada": [40.3515, -8.4443], "Melgaço": [42.0302, -8.2551],
  "Mesão Frio": [41.1624, -7.8783], "Mira": [40.4247, -8.7268], "Miranda do Corvo": [40.1137, -8.3357],
  "Miranda do Douro": [41.461, -6.4228], "Mirandela": [41.5064, -7.2293], "Mogadouro": [41.338, -6.7055],
  "Moimenta da Beira": [40.9671, -7.6362], "Moita": [38.6449, -9.004], "Monchique": [37.309, -8.595],
  "Mondim de Basto": [41.3767, -7.932], "Monforte": [39.0288, -7.4297], "Montalegre": [41.7422, -7.8935],
  "Montemor-o-Novo": [38.6472, -8.2639], "Montemor-o-Velho": [40.2081, -8.6534], "Montijo": [38.7354, -8.7672],
  "Monção": [42.021, -8.3519], "Mora": [38.9215, -8.0837], "Mortágua": [40.4411, -8.2545],
  "Moura": [38.1307, -7.2119], "Mourão": [38.2998, -7.2812], "Murtosa": [40.7689, -8.6497],
  "Murça": [41.4108, -7.418], "Mértola": [37.5695, -7.7415], "Mêda": [40.9339, -7.2648],
  "Nazaré": [39.5669, -9.0538], "Nelas": [40.5188, -7.8499], "Nisa": [39.4865, -7.6552],
  "Nordeste": [37.8308, -25.2467], "Odemira": [37.5739, -8.615], "Odivelas": [38.7966, -9.2005],
  "Oeiras": [38.6995, -9.2876], "Oleiros": [39.9324, -7.8072], "Olhão": [37.1039, -7.814],
  "Oliveira de Azeméis": [40.8205, -8.4746], "Oliveira de Frades": [40.6966, -8.232],
  "Oliveira do Bairro": [40.5167, -8.5589], "Oliveira do Hospital": [40.3628, -7.8778],
  "Ourique": [37.6014, -8.2887], "Ourém": [39.717, -8.5501], "Ovar": [40.8729, -8.5788],
  "Palmela": [38.5939, -8.8148], "Pampilhosa da Serra": [40.0798, -7.9286], "Paredes": [41.1876, -8.3908],
  "Paredes de Coura": [41.8957, -8.5541], "Paços de Ferreira": [41.2736, -8.3863],
  "Pedrógão Grande": [39.9563, -8.1773], "Penacova": [40.2991, -8.2712], "Penafiel": [41.1788, -8.2798],
  "Penalva do Castelo": [40.6556, -7.674], "Penamacor": [40.1633, -7.1685], "Penedono": [41.0277, -7.3627],
  "Penela": [40.005, -8.3762], "Peniche": [39.3453, -9.3512], "Peso da Régua": [41.1921, -7.7751],
  "Pinhel": [40.7501, -7.1128], "Pombal": [39.906, -8.6343], "Ponta Delgada": [37.8276, -25.7177],
  "Ponta do Sol": [32.7047, -17.1048], "Ponte da Barca": [41.8035, -8.334], "Ponte de Lima": [41.7437, -8.5926],
  "Ponte de Sor": [39.2071, -8.0882], "Portalegre": [39.2788, -7.437], "Portel": [38.3198, -7.7199],
  "Portimão": [37.1992, -8.59], "Porto": [41.1635, -8.6637], "Porto Moniz": [32.831, -17.1535],
  "Porto Santo": [33.0688, -16.3523], "Porto de Mós": [39.5634, -8.8086], "Povoação": [37.7669, -25.3062],
  "Praia da Vitória": [38.758, -27.1577], "Proença-a-Nova": [39.7191, -7.8443],
  "Póvoa de Lanhoso": [41.584, -8.2338], "Póvoa de Varzim": [41.4112, -8.6912], "Redondo": [38.6229, -7.6083],
  "Reguengos de Monsaraz": [38.4133, -7.4431], "Resende": [41.0924, -7.9159],
  "Ribeira Brava": [32.6892, -17.0413], "Ribeira Grande": [37.8141, -25.4327],
  "Ribeira de Pena": [41.5223, -7.7833], "Rio Maior": [39.3233, -8.8926], "Sabrosa": [41.2561, -7.6113],
  "Sabugal": [40.3528, -7.117], "Salvaterra de Magos": [39.0571, -8.6631], "Santa Comba Dão": [40.4107, -8.107],
  "Santa Cruz": [32.6196, -16.7315], "Santa Cruz da Graciosa": [39.0542, -28.0055],
  "Santa Cruz das Flores": [39.4784, -31.1744], "Santa Maria da Feira": [40.9628, -8.4877],
  "Santa Marta de Penaguião": [41.2334, -7.8102], "Santana": [32.7936, -16.8855], "Santarém": [39.3377, -8.7498],
  "Santiago do Cacém": [37.9649, -8.5774], "Santo Tirso": [41.349, -8.4189], "Sardoal": [39.5587, -8.1352],
  "Seia": [40.3874, -7.7329], "Seixal": [38.6118, -9.1306], "Sernancelhe": [40.8928, -7.5063],
  "Serpa": [37.9034, -7.5043], "Sertã": [39.8028, -8.1003], "Sesimbra": [38.4563, -9.1279],
  "Setúbal": [38.5143, -8.9559], "Sever do Vouga": [40.7376, -8.3645], "Silves": [37.2697, -8.3417],
  "Sines": [37.9329, -8.8365], "Sintra": [38.8368, -9.3545], "Sobral de Monte Agraço": [38.9874, -9.1679],
  "Soure": [40.0851, -8.6281], "Sousel": [38.9868, -7.7375], "Sátão": [40.7749, -7.6929],
  "São Brás de Alportel": [37.2025, -7.8827], "São João da Madeira": [40.8921, -8.491],
  "São João da Pesqueira": [41.1005, -7.4445], "São Pedro do Sul": [40.8366, -8.0642],
  "São Roque do Pico": [38.5073, -28.2836], "São Vicente": [32.8109, -17.0068], "Tabuaço": [41.1, -7.5521],
  "Tarouca": [41.032, -7.7544], "Tavira": [37.251, -7.7581], "Terras de Bouro": [41.7388, -8.1902],
  "Tomar": [39.6253, -8.389], "Tondela": [40.5261, -8.1557], "Torre de Moncorvo": [41.1819, -7.0251],
  "Torres Novas": [39.4969, -8.5482], "Torres Vedras": [39.0925, -9.2866], "Trancoso": [40.8085, -7.3238],
  "Trofa": [41.3029, -8.5657], "Tábua": [40.3294, -8.0111], "Vagos": [40.5003, -8.6699],
  "Vale de Cambra": [40.8423, -8.3631], "Valença": [41.9991, -8.6093], "Valongo": [41.2143, -8.4881],
  "Valpaços": [41.6093, -7.3111], "Velas": [38.6772, -28.1541], "Vendas Novas": [38.6585, -8.505],
  "Viana do Alentejo": [38.3807, -8.0633], "Viana do Castelo": [41.7142, -8.7834],
  "Vidigueira": [38.1652, -7.7376], "Vieira do Minho": [41.6218, -8.1174], "Vila Flor": [41.3043, -7.1606],
  "Vila Franca de Xira": [38.9595, -9.0256], "Vila Franca do Campo": [37.7476, -25.4173],
  "Vila Nova da Barquinha": [39.4894, -8.415], "Vila Nova de Cerveira": [41.8892, -8.7112],
  "Vila Nova de Famalicão": [41.3976, -8.5119], "Vila Nova de Foz Côa": [41.0501, -7.2186],
  "Vila Nova de Gaia": [41.0556, -8.5822], "Vila Nova de Paiva": [40.8655, -7.7735],
  "Vila Nova de Poiares": [40.2174, -8.2473], "Vila Pouca de Aguiar": [41.5279, -7.636],
  "Vila Real": [41.251, -7.7294], "Vila Real de Santo António": [37.194, -7.5147],
  "Vila Velha de Ródão": [39.6967, -7.6925], "Vila Verde": [41.6933, -8.4207], "Vila Viçosa": [38.7795, -7.3251],
  "Vila de Rei": [39.68, -8.1432], "Vila do Bispo": [37.0694, -8.9099], "Vila do Conde": [41.3365, -8.7038],
  "Vila do Porto": [36.9722, -25.104], "Vimioso": [41.5429, -6.5446], "Vinhais": [41.7968, -7.0315],
  "Viseu": [40.6966, -7.8805], "Vizela": [41.3783, -8.287], "Vouzela": [40.6769, -8.1539],
  "Águeda": [40.5811, -8.3594], "Évora": [38.539, -7.8735], "Ílhavo": [40.5977, -8.6747],
  "Óbidos": [39.3522, -9.1792],
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const byName = new Map(Object.keys(municipalities).map((name) => [normalize(name), name]));
// Longest names first, so "Vila Nova de Gaia" wins over "Gaia"-like partial matches.
const names = [...byName.keys()].sort((a, b) => b.length - a.length);

const isLetter = (char: string | undefined) => !!char && /[a-z0-9]/.test(char);
// Whole-word containment, so "Maia" does not match inside "Macieira da Maiato".
const containsWord = (text: string, word: string) => {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1))
    if (!isLetter(text[at - 1]) && !isLetter(text[at + word.length])) return true;
  return false;
};

/** Resolves a free-text location ("Maia", "Mosteiró, Vila do Conde") to its municipality centroid. */
export function locateMunicipality(location: string | undefined | null) {
  if (!location?.trim()) return null;
  const text = normalize(location);
  const last = normalize(location.split(",").at(-1) ?? "");
  const key = byName.has(text)
    ? text
    : byName.has(last)
      ? last
      : names.find((name) => containsWord(text, name));
  if (!key) return null;
  const name = byName.get(key)!;
  const [lat, lng] = municipalities[name];
  return { municipality: name, lat, lng };
}

// Companies are placed at their address when known, otherwise at their municipality centroid. Companies that
// share a point (same postal code, or same municipality without address) get an offset on a ring, in screen
// pixels, so the map can keep them apart at every zoom level.
export function placeCompanies<T extends { location?: string; coordinates?: { lat: number; lng: number } }>(companies: T[]) {
  const groups = new Map<string, { company: T; lat: number; lng: number; precise: boolean }[]>();
  const unplaced: T[] = [];
  for (const company of companies) {
    const spot = company.coordinates ?? locateMunicipality(company.location);
    if (!spot) { unplaced.push(company); continue; }
    const precise = !!company.coordinates;
    const key = precise ? `${spot.lat.toFixed(4)},${spot.lng.toFixed(4)}` : `m:${locateMunicipality(company.location)!.municipality}`;
    const group = groups.get(key) ?? [];
    group.push({ company, lat: spot.lat, lng: spot.lng, precise });
    groups.set(key, group);
  }
  const placed = [...groups.values()].flatMap((group) =>
    group.map((entry, index) => {
      if (group.length === 1) return { ...entry, dx: 0, dy: 0 };
      const angle = (2 * Math.PI * index) / group.length - Math.PI / 2;
      const radius = 10 + 1.8 * group.length;
      return { ...entry, dx: Math.round(radius * Math.cos(angle)), dy: Math.round(radius * Math.sin(angle)) };
    }),
  );
  return { placed, unplaced };
}
