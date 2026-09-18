exports.seed = async function (knex) {
  const tables = ["mobile_prefixes"];
  const seeds = [
    [
      // Insert UK Prefix
      {
        prefix: "44",
        country: "UK",
      },

      // Insert Canada Prefix
      {
        prefix: "1",
        country: "Canada",
      },

      // Insert Algeria Prefix
      {
        prefix: "213",
        country: "Algeria",
      },

      // Insert Andorra Prefix
      {
        prefix: "376",
        country: "Andorra",
      },

      // Insert Angola Prefix
      {
        prefix: "244",
        country: "Angola",
      },

      // Insert Anguilla Prefix
      {
        prefix: "1264",
        country: "Anguilla",
      },

      // Insert Antigua & Barbuda Prefix
      {
        prefix: "1268",
        country: "Antigua & Barbuda",
      },

      // Insert Argentina Prefix
      {
        prefix: "54",
        country: "Argentina",
      },

      // Insert Armenia Prefix
      {
        prefix: "374",
        country: "Armenia",
      },

      // Insert Aruba Prefix
      {
        prefix: "297",
        country: "Aruba",
      },

      // Insert Australia Prefix
      {
        prefix: "61",
        country: "Australia",
      },

      // Insert Austria Prefix
      {
        prefix: "43",
        country: "Austria",
      },

      // Insert Azerbaijan Prefix
      {
        prefix: "994",
        country: "Azerbaijan",
      },

      // Insert Bahamas Prefix
      {
        prefix: "1242",
        country: "Bahamas",
      },

      // Insert Bahrain Prefix
      {
        prefix: "973",
        country: "Bahrain",
      },

      // Insert Bangladesh Prefix
      {
        prefix: "880",
        country: "Bangladesh",
      },

      // Insert Barbados Prefix
      {
        prefix: "1246",
        country: "Barbados",
      },

      // Insert Belarus Prefix
      {
        prefix: "375",
        country: "Belarus",
      },

      // Insert Belgium Prefix
      {
        prefix: "32",
        country: "Belgium",
      },

      // Insert Belize Prefix
      {
        prefix: "501",
        country: "Belize",
      },

      // Insert Benin Prefix
      {
        prefix: "229",
        country: "Benin",
      },

      // Insert Bermuda Prefix
      {
        prefix: "1441",
        country: "Bermuda",
      },

      // Insert Bhutan Prefix
      {
        prefix: "975",
        country: "Bhutan",
      },

      // Insert Bolivia Prefix
      {
        prefix: "591",
        country: "Bolivia",
      },

      // Insert Bosnia Herzegovina Prefix
      {
        prefix: "387",
        country: "Bosnia Herzegovina",
      },

      // Insert Botswana Prefix
      {
        prefix: "267",
        country: "Botswana",
      },

      // Insert Brazil Prefix
      {
        prefix: "55",
        country: "Brazil",
      },

      // Insert Brunei Prefix
      {
        prefix: "673",
        country: "Brunei",
      },

      // Insert Bulgaria Prefix
      {
        prefix: "359",
        country: "Bulgaria",
      },

      // Insert Burkina Faso Prefix
      {
        prefix: "226",
        country: "Burkina Faso",
      },

      // Insert Burundi Prefix
      {
        prefix: "257",
        country: "Burundi",
      },

      // Insert Cambodia Prefix
      {
        prefix: "855",
        country: "Cambodia",
      },

      // Insert Cameroon Prefix
      {
        prefix: "237",
        country: "Cameroon",
      },

      // Insert Cape Verde Islands Prefix
      {
        prefix: "238",
        country: "Cape Verde Islands",
      },

      // Insert Cayman Islands Prefix
      {
        prefix: "1345",
        country: "Cayman Islands",
      },

      // Insert Central African Republic Prefix
      {
        prefix: "236",
        country: "Central African Republic",
      },

      // Insert Chile Prefix
      {
        prefix: "56",
        country: "Chile",
      },

      // Insert China Prefix
      {
        prefix: "86",
        country: "China",
      },

      // Insert Colombia Prefix
      {
        prefix: "57",
        country: "Colombia",
      },

      // Insert Mayotte Prefix
      {
        prefix: "269",
        country: "Mayotte",
      },

      // Insert Congo Prefix
      {
        prefix: "242",
        country: "Congo",
      },

      // Insert Cook Islands Prefix
      {
        prefix: "682",
        country: "Cook Islands",
      },

      // Insert Costa Rica Prefix
      {
        prefix: "506",
        country: "Costa Rica",
      },

      // Insert Croatia Prefix
      {
        prefix: "385",
        country: "Croatia",
      },

      // Insert Cuba Prefix
      {
        prefix: "53",
        country: "Cuba",
      },

      // Insert Cyprus North Prefix
      {
        prefix: "90392",
        country: "Cyprus North",
      },

      // Insert Cyprus South Prefix
      {
        prefix: "357",
        country: "Cyprus South",
      },

      // Insert Czech Republic Prefix
      {
        prefix: "42",
        country: "Czech Republic",
      },

      // Insert Denmark Prefix
      {
        prefix: "45",
        country: "Denmark",
      },

      // Insert Djibouti Prefix
      {
        prefix: "253",
        country: "Djibouti",
      },

      // Insert Dominican Republic Prefix
      {
        prefix: "1809",
        country: "Dominican Republic",
      },

      // Insert Ecuador Prefix
      {
        prefix: "593",
        country: "Ecuador",
      },

      // Insert Egypt Prefix
      {
        prefix: "20",
        country: "Egypt",
      },

      // Insert El Salvador Prefix
      {
        prefix: "503",
        country: "El Salvador",
      },

      // Insert Equatorial Guinea Prefix
      {
        prefix: "240",
        country: "Equatorial Guinea",
      },

      // Insert Eritrea Prefix
      {
        prefix: "291",
        country: "Eritrea",
      },

      // Insert Estonia Prefix
      {
        prefix: "372",
        country: "Estonia",
      },

      // Insert Ethiopia Prefix
      {
        prefix: "251",
        country: "Ethiopia",
      },

      // Insert Falkland Islands Prefix
      {
        prefix: "500",
        country: "Falkland Islands",
      },

      // Insert Faroe Islands Prefix
      {
        prefix: "298",
        country: "Faroe Islands",
      },

      // Insert Fiji Prefix
      {
        prefix: "679",
        country: "Fiji",
      },

      // Insert Finland Prefix
      {
        prefix: "358",
        country: "Finland",
      },

      // Insert France Prefix
      {
        prefix: "33",
        country: "France",
      },

      // Insert French Guiana Prefix
      {
        prefix: "594",
        country: "French Guiana",
      },

      // Insert French Polynesia Prefix
      {
        prefix: "689",
        country: "French Polynesia",
      },

      // Insert Gabon Prefix
      {
        prefix: "241",
        country: "Gabon",
      },

      // Insert Gambia Prefix
      {
        prefix: "220",
        country: "Gambia",
      },

      // Insert Georgia Prefix
      {
        prefix: "7880",
        country: "Georgia",
      },

      // Insert Germany Prefix
      {
        prefix: "49",
        country: "Germany",
      },

      // Insert Ghana Prefix
      {
        prefix: "233",
        country: "Ghana",
      },

      // Insert Gibraltar Prefix
      {
        prefix: "350",
        country: "Gibraltar",
      },

      // Insert Greece Prefix
      {
        prefix: "30",
        country: "Greece",
      },

      // Insert Greenland Prefix
      {
        prefix: "299",
        country: "Greenland",
      },

      // Insert Grenada Prefix
      {
        prefix: "1473",
        country: "Grenada",
      },

      // Insert Guadeloupe Prefix
      {
        prefix: "590",
        country: "Guadeloupe",
      },

      // Insert Guam Prefix
      {
        prefix: "671",
        country: "Guam",
      },

      // Insert Guatemala Prefix
      {
        prefix: "502",
        country: "Guatemala",
      },

      // Insert Guinea Prefix
      {
        prefix: "224",
        country: "Guinea",
      },

      // Insert Guinea - Bissau Prefix
      {
        prefix: "245",
        country: "Guinea - Bissau",
      },

      // Insert Guyana Prefix
      {
        prefix: "592",
        country: "Guyana",
      },

      // Insert Haiti Prefix
      {
        prefix: "509",
        country: "Haiti",
      },

      // Insert Honduras Prefix
      {
        prefix: "504",
        country: "Honduras",
      },

      // Insert Hong Kong Prefix
      {
        prefix: "852",
        country: "Hong Kong",
      },

      // Insert Hungary Prefix
      {
        prefix: "36",
        country: "Hungary",
      },

      // Insert Iceland Prefix
      {
        prefix: "354",
        country: "Iceland",
      },

      // Insert India Prefix
      {
        prefix: "91",
        country: "India",
      },

      // Insert Indonesia Prefix
      {
        prefix: "62",
        country: "Indonesia",
      },

      // Insert Iran Prefix
      {
        prefix: "98",
        country: "Iran",
      },

      // Insert Iraq Prefix
      {
        prefix: "964",
        country: "Iraq",
      },

      // Insert Ireland Prefix
      {
        prefix: "353",
        country: "Ireland",
      },

      // Insert Israel Prefix
      {
        prefix: "972",
        country: "Israel",
      },

      // Insert Italy Prefix
      {
        prefix: "39",
        country: "Italy",
      },

      // Insert Jamaica Prefix
      {
        prefix: "1876",
        country: "Jamaica",
      },

      // Insert Japan Prefix
      {
        prefix: "81",
        country: "Japan",
      },

      // Insert Jordan Prefix
      {
        prefix: "962",
        country: "Jordan",
      },

      // Insert Uzbekistan Prefix
      {
        prefix: "7",
        country: "Uzbekistan",
      },

      // Insert Kenya Prefix
      {
        prefix: "254",
        country: "Kenya",
      },

      // Insert Kiribati Prefix
      {
        prefix: "686",
        country: "Kiribati",
      },

      // Insert Korea North Prefix
      {
        prefix: "850",
        country: "Korea North",
      },

      // Insert Korea South Prefix
      {
        prefix: "82",
        country: "Korea South",
      },

      // Insert Kuwait Prefix
      {
        prefix: "965",
        country: "Kuwait",
      },

      // Insert Kyrgyzstan Prefix
      {
        prefix: "996",
        country: "Kyrgyzstan",
      },

      // Insert Laos Prefix
      {
        prefix: "856",
        country: "Laos",
      },

      // Insert Latvia Prefix
      {
        prefix: "371",
        country: "Latvia",
      },

      // Insert Lebanon Prefix
      {
        prefix: "961",
        country: "Lebanon",
      },

      // Insert Lesotho Prefix
      {
        prefix: "266",
        country: "Lesotho",
      },

      // Insert Liberia Prefix
      {
        prefix: "231",
        country: "Liberia",
      },

      // Insert Libya Prefix
      {
        prefix: "218",
        country: "Libya",
      },

      // Insert Liechtenstein Prefix
      {
        prefix: "417",
        country: "Liechtenstein",
      },

      // Insert Lithuania Prefix
      {
        prefix: "370",
        country: "Lithuania",
      },

      // Insert Luxembourg Prefix
      {
        prefix: "352",
        country: "Luxembourg",
      },

      // Insert Macao Prefix
      {
        prefix: "853",
        country: "Macao",
      },

      // Insert Macedonia Prefix
      {
        prefix: "389",
        country: "Macedonia",
      },

      // Insert Madagascar Prefix
      {
        prefix: "261",
        country: "Madagascar",
      },

      // Insert Malawi Prefix
      {
        prefix: "265",
        country: "Malawi",
      },

      // Insert Malaysia Prefix
      {
        prefix: "60",
        country: "Malaysia",
      },

      // Insert Maldives Prefix
      {
        prefix: "960",
        country: "Maldives",
      },

      // Insert Mali Prefix
      {
        prefix: "223",
        country: "Mali",
      },

      // Insert Malta Prefix
      {
        prefix: "356",
        country: "Malta",
      },

      // Insert Marshall Islands Prefix
      {
        prefix: "692",
        country: "Marshall Islands",
      },

      // Insert Martinique Prefix
      {
        prefix: "596",
        country: "Martinique",
      },

      // Insert Mauritania Prefix
      {
        prefix: "222",
        country: "Mauritania",
      },

      // Insert Mexico Prefix
      {
        prefix: "52",
        country: "Mexico",
      },

      // Insert Micronesia Prefix
      {
        prefix: "691",
        country: "Micronesia",
      },

      // Insert Moldova Prefix
      {
        prefix: "373",
        country: "Moldova",
      },

      // Insert Monaco Prefix
      {
        prefix: "377",
        country: "Monaco",
      },

      // Insert Mongolia Prefix
      {
        prefix: "976",
        country: "Mongolia",
      },

      // Insert Montserrat Prefix
      {
        prefix: "1664",
        country: "Montserrat",
      },

      // Insert Morocco Prefix
      {
        prefix: "212",
        country: "Morocco",
      },

      // Insert Mozambique Prefix
      {
        prefix: "258",
        country: "Mozambique",
      },

      // Insert Myanmar Prefix
      {
        prefix: "95",
        country: "Myanmar",
      },

      // Insert Namibia Prefix
      {
        prefix: "264",
        country: "Namibia",
      },

      // Insert Nauru Prefix
      {
        prefix: "674",
        country: "Nauru",
      },

      // Insert Nepal Prefix
      {
        prefix: "977",
        country: "Nepal",
      },

      // Insert Netherlands Prefix
      {
        prefix: "31",
        country: "Netherlands",
      },

      // Insert New Caledonia Prefix
      {
        prefix: "687",
        country: "New Caledonia",
      },

      // Insert New Zealand Prefix
      {
        prefix: "64",
        country: "New Zealand",
      },

      // Insert Nicaragua Prefix
      {
        prefix: "505",
        country: "Nicaragua",
      },

      // Insert Niger Prefix
      {
        prefix: "227",
        country: "Niger",
      },

      // Insert Nigeria Prefix
      {
        prefix: "234",
        country: "Nigeria",
      },

      // Insert Niue Prefix
      {
        prefix: "683",
        country: "Niue",
      },

      // Insert Norfolk Islands Prefix
      {
        prefix: "672",
        country: "Norfolk Islands",
      },

      // Insert Northern Marianas Prefix
      {
        prefix: "670",
        country: "Northern Marianas",
      },

      // Insert Norway Prefix
      {
        prefix: "47",
        country: "Norway",
      },

      // Insert Oman Prefix
      {
        prefix: "968",
        country: "Oman",
      },

      // Insert Palau Prefix
      {
        prefix: "680",
        country: "Palau",
      },

      // Insert Panama Prefix
      {
        prefix: "507",
        country: "Panama",
      },

      // Insert Papua New Guinea Prefix
      {
        prefix: "675",
        country: "Papua New Guinea",
      },

      // Insert Paraguay Prefix
      {
        prefix: "595",
        country: "Paraguay",
      },

      // Insert Peru Prefix
      {
        prefix: "51",
        country: "Peru",
      },

      // Insert Philippines Prefix
      {
        prefix: "63",
        country: "Philippines",
      },

      // Insert Poland Prefix
      {
        prefix: "48",
        country: "Poland",
      },

      // Insert Portugal Prefix
      {
        prefix: "351",
        country: "Portugal",
      },

      // Insert Puerto Rico Prefix
      {
        prefix: "1787",
        country: "Puerto Rico",
      },

      // Insert Qatar Prefix
      {
        prefix: "974",
        country: "Qatar",
      },

      // Insert Reunion Prefix
      {
        prefix: "262",
        country: "Reunion",
      },

      // Insert Romania Prefix
      {
        prefix: "40",
        country: "Romania",
      },

      // Insert Rwanda Prefix
      {
        prefix: "250",
        country: "Rwanda",
      },

      // Insert San Marino Prefix
      {
        prefix: "378",
        country: "San Marino",
      },

      // Insert Sao Tome & Principe Prefix
      {
        prefix: "239",
        country: "Sao Tome & Principe",
      },

      // Insert Saudi Arabia Prefix
      {
        prefix: "966",
        country: "Saudi Arabia",
      },

      // Insert Senegal Prefix
      {
        prefix: "221",
        country: "Senegal",
      },

      // Insert Serbia Prefix
      {
        prefix: "381",
        country: "Serbia",
      },

      // Insert Seychelles Prefix
      {
        prefix: "248",
        country: "Seychelles",
      },

      // Insert Sierra Leone Prefix
      {
        prefix: "232",
        country: "Sierra Leone",
      },

      // Insert Singapore Prefix
      {
        prefix: "65",
        country: "Singapore",
      },

      // Insert Slovak Republic Prefix
      {
        prefix: "421",
        country: "Slovak Republic",
      },

      // Insert Slovenia Prefix
      {
        prefix: "386",
        country: "Slovenia",
      },

      // Insert Solomon Islands Prefix
      {
        prefix: "677",
        country: "Solomon Islands",
      },

      // Insert Somalia Prefix
      {
        prefix: "252",
        country: "Somalia",
      },

      // Insert South Africa Prefix
      {
        prefix: "27",
        country: "South Africa",
      },

      // Insert Spain Prefix
      {
        prefix: "34",
        country: "Spain",
      },

      // Insert Sri Lanka Prefix
      {
        prefix: "94",
        country: "Sri Lanka",
      },

      // Insert St. Helena Prefix
      {
        prefix: "290",
        country: "St. Helena",
      },

      // Insert St. Kitts Prefix
      {
        prefix: "1869",
        country: "St. Kitts",
      },

      // Insert St. Lucia Prefix
      {
        prefix: "1758",
        country: "St. Lucia",
      },

      // Insert Sudan Prefix
      {
        prefix: "249",
        country: "Sudan",
      },

      // Insert Suriname Prefix
      {
        prefix: "597",
        country: "Suriname",
      },

      // Insert Swaziland Prefix
      {
        prefix: "268",
        country: "Swaziland",
      },

      // Insert Sweden Prefix
      {
        prefix: "46",
        country: "Sweden",
      },

      // Insert Switzerland Prefix
      {
        prefix: "41",
        country: "Switzerland",
      },

      // Insert Syria Prefix
      {
        prefix: "963",
        country: "Syria",
      },

      // Insert Taiwan Prefix
      {
        prefix: "886",
        country: "Taiwan",
      },

      // Insert Thailand Prefix
      {
        prefix: "66",
        country: "Thailand",
      },

      // Insert Togo Prefix
      {
        prefix: "228",
        country: "Togo",
      },

      // Insert Tonga Prefix
      {
        prefix: "676",
        country: "Tonga",
      },

      // Insert Trinidad & Tobago Prefix
      {
        prefix: "1868",
        country: "Trinidad & Tobago",
      },

      // Insert Tunisia Prefix
      {
        prefix: "216",
        country: "Tunisia",
      },

      // Insert Turkey Prefix
      {
        prefix: "90",
        country: "Turkey",
      },

      // Insert Turkmenistan Prefix
      {
        prefix: "993",
        country: "Turkmenistan",
      },

      // Insert Turks & Caicos Islands Prefix
      {
        prefix: "1649",
        country: "Turks & Caicos Islands",
      },

      // Insert Tuvalu Prefix
      {
        prefix: "688",
        country: "Tuvalu",
      },

      // Insert Uganda Prefix
      {
        prefix: "256",
        country: "Uganda",
      },

      // Insert Ukraine Prefix
      {
        prefix: "380",
        country: "Ukraine",
      },

      // Insert United Arab Emirates Prefix
      {
        prefix: "971",
        country: "United Arab Emirates",
      },

      // Insert Uruguay Prefix
      {
        prefix: "598",
        country: "Uruguay",
      },

      // Insert Vanuatu Prefix
      {
        prefix: "678",
        country: "Vanuatu",
      },

      // Insert Vatican City Prefix
      {
        prefix: "379",
        country: "Vatican City",
      },

      // Insert Venezuela Prefix
      {
        prefix: "58",
        country: "Venezuela",
      },

      // Insert Virgin Islands - US Prefix
      {
        prefix: "84",
        country: "Virgin Islands - US",
      },

      // Insert Wallis & Futuna Prefix
      {
        prefix: "681",
        country: "Wallis & Futuna",
      },

      // Insert Yemen Prefix
      {
        prefix: "969",
        country: "Yemen",
      },

      // Insert Yemen Prefix
      {
        prefix: "967",
        country: "Yemen",
      },

      // Insert Zambia Prefix
      {
        prefix: "260",
        country: "Zambia",
      },

      // Insert Zimbabwe Prefix
      {
        prefix: "263",
        country: "Zimbabwe",
      },
    ],
  ];

  for (let seed of seeds[0]) {
    let checkSeed = await knex(tables[0]).select().where(seed).first();
    if (!checkSeed) {
      await knex(tables[0]).insert(seed);
    }
  }
};
