// Field metadata: human-friendly labels and tooltips for the most important SCUM settings.
// Keys are the raw INI keys (e.g. "scum.ServerName"). Fallback humanization is used for keys not listed here.

export const FIELD_META = {
  // ===== General / Identity =====
  "scum.ServerName": {
    en: { label: "Server Name", desc: "Displayed name in the public server browser. Max 50 characters recommended." },
    tr: { label: "Sunucu Adı", desc: "Sunucu tarayıcısında görünen ad. En fazla 50 karakter önerilir." },
  },
  "scum.ServerDescription": {
    en: { label: "Description", desc: "Short text shown on the server details page." },
    tr: { label: "Açıklama", desc: "Sunucu detay sayfasında gösterilen kısa metin." },
  },
  "scum.ServerBannerUrl": {
    en: { label: "Banner URL", desc: "Direct link to an image used as server banner (JPG/PNG)." },
    tr: { label: "Afiş URL'si", desc: "Sunucu afişi olarak kullanılan görselin doğrudan bağlantısı." },
  },
  "scum.ServerPlaystyle": {
    en: { label: "Playstyle", desc: "PVE, PVP, PVPVE — shown in the browser so players can filter." },
    tr: { label: "Oyun Tarzı", desc: "PVE, PVP, PVPVE — oyuncuların filtrelemesi için listede görünür." },
  },
  "scum.ServerPassword": {
    en: { label: "Server Password", desc: "If set, players must enter this to join. Leave blank for public." },
    tr: { label: "Sunucu Şifresi", desc: "Ayarlanırsa oyuncular bağlanırken bu şifreyi girer. Halka açık için boş bırakın." },
  },
  "scum.MaxPlayers": {
    en: { label: "Max Players", desc: "Maximum concurrent players. Typical: 64. High values require strong hardware." },
    tr: { label: "Maksimum Oyuncu", desc: "Eş zamanlı maksimum oyuncu sayısı. Tipik: 64. Yüksek değerler güçlü donanım gerektirir." },
  },
  "scum.WelcomeMessage": {
    en: { label: "Welcome Message", desc: "Popup shown once to each player when they join." },
    tr: { label: "Hoş Geldiniz Mesajı", desc: "Her oyuncu bağlandığında bir kez gösterilen mesaj." },
  },
  "scum.MessageOfTheDay": {
    en: { label: "Message of the Day", desc: "Recurring broadcast in global chat." },
    tr: { label: "Günün Mesajı", desc: "Global sohbette belirli aralıklarla tekrarlanan duyuru." },
  },
  "scum.MessageOfTheDayCooldown": {
    en: { label: "MOTD Cooldown (min)", desc: "Minutes between MOTD broadcasts." },
    tr: { label: "Günün Mesajı Aralığı (dk)", desc: "Mesajın tekrar yayınlanması arasındaki dakika." },
  },

  // ===== Performance =====
  "scum.MinServerTickRate": {
    en: { label: "Min Tick Rate", desc: "Minimum server ticks per second (simulation updates)." },
    tr: { label: "Minimum Tick Hızı", desc: "Saniyede minimum sunucu tick sayısı (simülasyon güncellemesi)." },
  },
  "scum.MaxServerTickRate": {
    en: { label: "Max Tick Rate", desc: "Ceiling for simulation updates per second. Higher = smoother, more CPU." },
    tr: { label: "Maksimum Tick Hızı", desc: "Saniyedeki tavan simülasyon güncellemesi. Yüksek = akıcı, daha fazla CPU." },
  },
  "scum.MaxPingCheckEnabled": {
    en: { label: "Enable Max Ping Kick", desc: "Kick players whose ping exceeds the threshold below." },
    tr: { label: "Maksimum Ping Atma", desc: "Ping belirlenen eşiği aşan oyuncuları atar." },
  },
  "scum.MaxPing": {
    en: { label: "Max Ping (ms)", desc: "Players exceeding this ping are disconnected if ping kick is enabled." },
    tr: { label: "Maksimum Ping (ms)", desc: "Bu değeri geçen oyuncuların bağlantısı kesilir (ping atma açıksa)." },
  },

  // ===== View / Rules =====
  "scum.AllowFirstPerson": {
    en: { label: "Allow First-Person", desc: "Permit FP camera view." },
    tr: { label: "Birinci Şahsa İzin Ver", desc: "Birinci şahıs kamera görünümüne izin verir." },
  },
  "scum.AllowThirdPerson": {
    en: { label: "Allow Third-Person", desc: "Permit TP camera view (usually PVE only)." },
    tr: { label: "Üçüncü Şahsa İzin Ver", desc: "Üçüncü şahıs kamera görünümüne izin verir (genelde PVE)." },
  },
  "scum.AllowCrosshair": {
    en: { label: "Allow Crosshair", desc: "Show on-screen crosshair overlay." },
    tr: { label: "Nişangaha İzin Ver", desc: "Ekran üzerinde nişangah gösterir." },
  },
  "scum.AllowMapScreen": {
    en: { label: "Allow Map Screen", desc: "Let players open the full map view." },
    tr: { label: "Harita Ekranına İzin Ver", desc: "Oyuncuların tam haritayı açmasına izin verir." },
  },
  "scum.AllowKillClaiming": {
    en: { label: "Allow Kill Claiming", desc: "Let players claim kills they performed indirectly." },
    tr: { label: "Kill Sahiplenme", desc: "Oyuncuların dolaylı öldürmeleri sahiplenmesine izin verir." },
  },
  "scum.AllowComa": {
    en: { label: "Allow Coma State", desc: "Characters enter a coma before dying, allowing revival." },
    tr: { label: "Koma Durumu", desc: "Ölmeden önce karakter komaya girer ve canlandırılabilir." },
  },
  "scum.AllowMinesAndTraps": {
    en: { label: "Allow Mines & Traps", desc: "Enable placement of mines and traps." },
    tr: { label: "Mayın ve Tuzak", desc: "Mayın ve tuzakların kullanımını açar." },
  },
  "scum.AllowSkillGainInSafeZones": {
    en: { label: "Skill Gain in Safe Zones", desc: "Allow skill progression inside safe zones." },
    tr: { label: "Güvenli Bölgede Yetenek", desc: "Güvenli bölgelerde yetenek kazanımına izin verir." },
  },
  "scum.AllowEvents": {
    en: { label: "Allow Events", desc: "Enable in-game scheduled events." },
    tr: { label: "Etkinliklere İzin Ver", desc: "Zamanlanmış oyun içi etkinlikleri açar." },
  },
  "scum.LogoutTimer": {
    en: { label: "Logout Timer (s)", desc: "Seconds before a player fully disconnects after clicking logout." },
    tr: { label: "Çıkış Süresi (sn)", desc: "Çıkış butonundan sonra tam bağlantı kesilmesine kadar geçen saniye." },
  },
  "scum.LogoutTimerWhileCaptured": {
    en: { label: "Logout While Captured (s)", desc: "Extended timer when the player is captured." },
    tr: { label: "Esirken Çıkış (sn)", desc: "Oyuncu esirken uzatılmış çıkış süresi." },
  },

  // ===== Chat =====
  "scum.AllowGlobalChat": { en: { label: "Allow Global Chat", desc: "Enable server-wide chat channel." }, tr: { label: "Global Sohbet", desc: "Tüm sunucu sohbet kanalını açar." } },
  "scum.AllowLocalChat": { en: { label: "Allow Local Chat", desc: "Enable proximity-based voice/text." }, tr: { label: "Yerel Sohbet", desc: "Yakınlık tabanlı ses/metin sohbetini açar." } },
  "scum.AllowSquadChat": { en: { label: "Allow Squad Chat", desc: "Enable private squad channel." }, tr: { label: "Takım Sohbeti", desc: "Özel takım kanalını açar." } },
  "scum.AllowAdminChat": { en: { label: "Allow Admin Chat", desc: "Enable admin-only channel." }, tr: { label: "Yönetici Sohbeti", desc: "Yönetici özel kanalını açar." } },
  "scum.LimitGlobalChat": { en: { label: "Rate-Limit Global Chat", desc: "Apply spam protection to global chat." }, tr: { label: "Global Sohbeti Sınırla", desc: "Global sohbete spam koruması uygular." } },

  // ===== Voting =====
  "scum.AllowVoting": { en: { label: "Allow Voting", desc: "Enable in-game kick/ban voting system." }, tr: { label: "Oylamaya İzin Ver", desc: "Oyun içi kick/ban oylama sistemini açar." } },
  "scum.VotingDuration": { en: { label: "Voting Duration (s)", desc: "How long a vote stays open." }, tr: { label: "Oylama Süresi (sn)", desc: "Bir oylamanın açık kalma süresi." } },
  "scum.PlayerMinimalVotingInterest": { en: { label: "Min Participation", desc: "Fraction of players needed for a valid vote (0-1)." }, tr: { label: "Min Katılım", desc: "Geçerli oylama için gerekli oyuncu oranı (0-1)." } },
  "scum.PlayerPositiveVotePercentage": { en: { label: "Pass Threshold", desc: "Yes-vote percentage required to pass (0-1)." }, tr: { label: "Geçme Eşiği", desc: "Oylamanın geçmesi için gereken evet yüzdesi (0-1)." } },

  // ===== Damage =====
  "scum.HumanToHumanDamageMultiplier": { en: { label: "Player Damage Multiplier", desc: "Multiplier for all human-to-human damage." }, tr: { label: "Oyuncu Hasar Çarpanı", desc: "İnsan-insan hasarı için çarpan." } },
  "scum.ZombieDamageMultiplier": { en: { label: "Zombie Damage Multiplier", desc: "Damage dealt by puppets (zombies) to players." }, tr: { label: "Zombi Hasar Çarpanı", desc: "Zombilerin oyunculara verdiği hasar." } },
  "scum.ItemDecayDamageMultiplier": { en: { label: "Item Decay Multiplier", desc: "How fast items degrade from use/time." }, tr: { label: "Eşya Çürüme Çarpanı", desc: "Eşyaların kullanım/zamanla bozulma hızı." } },
  "scum.FoodDecayDamageMultiplier": { en: { label: "Food Decay Multiplier", desc: "How fast food spoils." }, tr: { label: "Yiyecek Çürüme Çarpanı", desc: "Yiyeceklerin bozulma hızı." } },

  // ===== Fame =====
  "scum.FameGainMultiplier": { en: { label: "Fame Gain Multiplier", desc: "Rate at which players earn fame points." }, tr: { label: "Şöhret Kazanım Çarpanı", desc: "Oyuncuların şöhret puanı kazanma hızı." } },
  "scum.FamePointPenaltyOnDeath": { en: { label: "Fame Loss on Death", desc: "Fraction of fame lost when dying (0-1)." }, tr: { label: "Ölünce Şöhret Kaybı", desc: "Ölümde kaybedilen şöhret oranı (0-1)." } },
  "scum.FamePointPenaltyOnKilled": { en: { label: "Fame Loss When Killed", desc: "Extra loss when killed by another player." }, tr: { label: "Öldürülünce Şöhret Kaybı", desc: "Başka oyuncu tarafından öldürülünce ek kayıp." } },
  "scum.FamePointRewardOnKill": { en: { label: "Fame on Kill", desc: "Fame granted for killing another player." }, tr: { label: "Kill'de Şöhret", desc: "Başka oyuncuyu öldürmekten kazanılan şöhret." } },

  // ===== Respawn =====
  "scum.AllowSectorRespawn": { en: { label: "Allow Sector Respawn", desc: "Players can respawn at a chosen sector." }, tr: { label: "Sektör Respawn", desc: "Oyuncuların seçilen sektörde doğmasına izin verir." } },
  "scum.AllowShelterRespawn": { en: { label: "Allow Shelter Respawn", desc: "Respawn at a claimed shelter location." }, tr: { label: "Barınakta Respawn", desc: "Sahip olunan barınakta yeniden doğma." } },
  "scum.AllowSquadmateRespawn": { en: { label: "Allow Squadmate Respawn", desc: "Spawn next to a squadmate." }, tr: { label: "Takım Arkadaşında Respawn", desc: "Takım arkadaşının yanında doğma." } },
  "scum.RandomRespawnPrice": { en: { label: "Random Respawn Price", desc: "Cost (credits) for random respawn." }, tr: { label: "Rastgele Respawn Bedeli", desc: "Rastgele doğumda ödenen kredi." } },
  "scum.SectorRespawnPrice": { en: { label: "Sector Respawn Price", desc: "Cost for sector-chosen respawn." }, tr: { label: "Sektör Respawn Bedeli", desc: "Sektör seçimli doğumda ödenen kredi." } },
  "scum.ShelterRespawnPrice": { en: { label: "Shelter Respawn Price", desc: "Price using gold suffix like 1g or numeric." }, tr: { label: "Barınak Respawn Bedeli", desc: "Altın soneki (1g) veya sayısal." } },

  // ===== World Limits =====
  "scum.MaxAllowedBirds": { en: { label: "Max Birds", desc: "Total bird entity limit." }, tr: { label: "Maksimum Kuş", desc: "Kuş varlık sınırı." } },
  "scum.MaxAllowedCharacters": { en: { label: "Max Characters", desc: "-1 = unlimited. Caps total characters." }, tr: { label: "Maksimum Karakter", desc: "-1 = sınırsız. Toplam karakter sınırı." } },
  "scum.MaxAllowedPuppets": { en: { label: "Max Puppets (zombies)", desc: "-1 = unlimited." }, tr: { label: "Maksimum Zombi", desc: "-1 = sınırsız." } },
  "scum.MaxAllowedAnimals": { en: { label: "Max Animals", desc: "Total wild animal limit." }, tr: { label: "Maksimum Hayvan", desc: "Vahşi hayvan sınırı." } },
  "scum.MaxAllowedNPCs": { en: { label: "Max NPCs", desc: "-1 = unlimited." }, tr: { label: "Maksimum NPC", desc: "-1 = sınırsız." } },
  "scum.MaxAllowedDrones": { en: { label: "Max Drones", desc: "Total drone spawn cap." }, tr: { label: "Maksimum Drone", desc: "Toplam drone spawn sınırı." } },

  // ===== Puppets =====
  "scum.PuppetsCanOpenDoors": { en: { label: "Puppets Open Doors", desc: "Zombies can open unlocked doors." }, tr: { label: "Zombiler Kapı Açar", desc: "Zombiler kilitsiz kapıları açabilir." } },
  "scum.PuppetsCanVaultWindows": { en: { label: "Puppets Vault Windows", desc: "Zombies can climb through windows." }, tr: { label: "Zombiler Pencereden Atlar", desc: "Zombiler pencerelerden atlayabilir." } },
  "scum.PuppetHealthMultiplier": { en: { label: "Puppet Health Mult", desc: "Zombie HP multiplier." }, tr: { label: "Zombi Can Çarpanı", desc: "Zombi canı çarpanı." } },
  "scum.PuppetRunningSpeedMultiplier": { en: { label: "Puppet Speed Mult", desc: "Zombie running speed multiplier." }, tr: { label: "Zombi Hız Çarpanı", desc: "Zombi koşma hızı çarpanı." } },

  // ===== Armed NPCs =====
  "scum.ArmedNPCDifficultyLevel": { en: { label: "Armed NPC Difficulty", desc: "1=easy ... 3=hard." }, tr: { label: "Silahlı NPC Zorluk", desc: "1=kolay ... 3=zor." } },
  "scum.ArmedNPCHealthMultiplier": { en: { label: "Armed NPC HP", desc: "HP multiplier for armed NPCs." }, tr: { label: "Silahlı NPC Canı", desc: "Silahlı NPC can çarpanı." } },
  "scum.ArmedNPCDamageMultiplier": { en: { label: "Armed NPC Damage", desc: "Damage multiplier." }, tr: { label: "Silahlı NPC Hasarı", desc: "Hasar çarpanı." } },
  "scum.ArmedNPCSpreadMultiplier": { en: { label: "Armed NPC Aim Spread", desc: "Higher = less accurate." }, tr: { label: "Silahlı NPC Saçılımı", desc: "Yüksek = düşük isabet." } },

  // ===== Raid Protection =====
  "scum.RaidProtectionType": { en: { label: "Raid Protection Type", desc: "0=Off, 1=Global times, 2=Flag-specific, 3=Offline." }, tr: { label: "Raid Koruma Türü", desc: "0=Kapalı, 1=Global saat, 2=Bayrağa özel, 3=Offline." } },
  "scum.RaidProtectionEnableLog": { en: { label: "Log Raid Events", desc: "Write raid attempts to log file." }, tr: { label: "Raid Log'u", desc: "Raid olaylarını log dosyasına yazar." } },

  // ===== Flag / Base Building =====
  "scum.FlagOvertakeDuration": { en: { label: "Flag Overtake Duration", desc: "Time (HH:MM:SS) needed to take over a flag." }, tr: { label: "Bayrak Ele Geçirme Süresi", desc: "Bayrağı ele geçirmek için gereken süre (HH:MM:SS)." } },
  "scum.MaximumAmountOfElementsPerFlag": { en: { label: "Max Elements per Flag", desc: "Building piece cap per flag area." }, tr: { label: "Bayrak Başına Maks Parça", desc: "Bayrak alanı başına yapı parça sınırı." } },
  "scum.AllowMultipleFlagsPerPlayer": { en: { label: "Multiple Flags per Player", desc: "Allow one player to place multiple flags." }, tr: { label: "Oyuncu Başına Çoklu Bayrak", desc: "Bir oyuncunun birden fazla bayrak koymasına izin verir." } },

  // ===== Time =====
  "scum.StartTimeOfDay": { en: { label: "Starting Time of Day", desc: "In-game start time (HH:MM:SS)." }, tr: { label: "Başlangıç Saati", desc: "Oyun içi başlangıç saati (HH:MM:SS)." } },
  "scum.TimeOfDaySpeed": { en: { label: "Day/Night Speed", desc: "Simulation speed for day/night cycle. 1.0 = real-time." }, tr: { label: "Gündüz/Gece Hızı", desc: "Gündüz/gece döngüsü hızı. 1.0 = gerçek zamanlı." } },
  "scum.SunriseTime": { en: { label: "Sunrise Time", desc: "Time of sunrise (HH:MM:SS)." }, tr: { label: "Gün Doğumu", desc: "Güneşin doğma saati (HH:MM:SS)." } },
  "scum.SunsetTime": { en: { label: "Sunset Time", desc: "Time of sunset (HH:MM:SS)." }, tr: { label: "Gün Batımı", desc: "Güneşin batma saati (HH:MM:SS)." } },
  "scum.EnableFog": { en: { label: "Enable Fog", desc: "Enable dynamic world fog." }, tr: { label: "Sis", desc: "Dinamik dünya sisini açar." } },

  // ===== Animals =====
  "scum.BearMaxHealthMultiplier": { en: { label: "Bear HP", desc: "Max HP multiplier for bears." }, tr: { label: "Ayı Canı", desc: "Ayıların maks can çarpanı." } },
  "scum.WolfMaxHealthMultiplier": { en: { label: "Wolf HP", desc: "Max HP multiplier for wolves." }, tr: { label: "Kurt Canı", desc: "Kurtların maks can çarpanı." } },
  "scum.BoarMaxHealthMultiplier": { en: { label: "Boar HP", desc: "Max HP multiplier for boars." }, tr: { label: "Yaban Domuzu Canı", desc: "Yaban domuzları maks can çarpanı." } },
  "scum.DeerMaxHealthMultiplier": { en: { label: "Deer HP", desc: "Max HP multiplier for deer." }, tr: { label: "Geyik Canı", desc: "Geyiklerin maks can çarpanı." } },
  "scum.RabbitMaxHealthMultiplier": { en: { label: "Rabbit HP", desc: "Max HP multiplier for rabbits." }, tr: { label: "Tavşan Canı", desc: "Tavşanların maks can çarpanı." } },

  // ===== Cargo =====
  "scum.CargoDropCooldownMinimum": { en: { label: "Cargo Drop Cooldown Min (min)", desc: "Minimum minutes between cargo drops." }, tr: { label: "Kargo Düşüşü Min Bekleme (dk)", desc: "Kargo düşüşleri arasındaki minimum dakika." } },
  "scum.CargoDropCooldownMaximum": { en: { label: "Cargo Drop Cooldown Max (min)", desc: "Maximum minutes between cargo drops." }, tr: { label: "Kargo Düşüşü Maks Bekleme (dk)", desc: "Kargo düşüşleri arasındaki maksimum dakika." } },

  // ===== Quests =====
  "scum.QuestsEnabled": { en: { label: "Quests Enabled", desc: "Master switch for quests." }, tr: { label: "Görevler Aktif", desc: "Görev sistemi ana anahtarı." } },
  "scum.MaxQuestsPerCyclePerTrader": { en: { label: "Max Quests per Trader/Cycle", desc: "Quests a trader gives per cycle." }, tr: { label: "Döngü Başına Tüccar Görevi", desc: "Tüccarın döngü başına verdiği görev sayısı." } },

  // ===== Turrets =====
  "scum.TurretsAttackPuppets": { en: { label: "Turrets Attack Zombies", desc: "Turrets target puppets/zombies." }, tr: { label: "Taretler Zombilere Ateş", desc: "Taretler zombileri hedef alır." } },
  "scum.TurretsAttackPrisoners": { en: { label: "Turrets Attack Prisoners", desc: "Turrets fire on players (dangerous)." }, tr: { label: "Taretler Oyunculara Ateş", desc: "Taretler oyunculara ateş eder (tehlikeli)." } },
  "scum.TurretsAttackAnimals": { en: { label: "Turrets Attack Animals", desc: "Turrets target wildlife." }, tr: { label: "Taretler Hayvanlara Ateş", desc: "Taretler vahşi yaşamı hedef alır." } },
  "scum.TurretsAttackArmedNPCs": { en: { label: "Turrets Attack Armed NPCs", desc: "Turrets target armed NPCs." }, tr: { label: "Taretler Silahlı NPC'lere Ateş", desc: "Taretler silahlı NPC'leri hedef alır." } },

  // ===== Squad =====
  "scum.SquadMemberCountAtIntLevel1": { en: { label: "Squad Size — Int 1", desc: "Max squad size at Intelligence 1." }, tr: { label: "Takım · Zeka 1", desc: "Zeka 1'de maksimum takım boyutu." } },
  "scum.SquadMemberCountAtIntLevel5": { en: { label: "Squad Size — Int 5", desc: "Max squad size at Intelligence 5." }, tr: { label: "Takım · Zeka 5", desc: "Zeka 5'de maksimum takım boyutu." } },

  // ===== New Player =====
  "scum.EnableNewPlayerProtection": { en: { label: "New Player Protection", desc: "Grants temporary invulnerability to new players." }, tr: { label: "Yeni Oyuncu Koruması", desc: "Yeni oyunculara geçici dokunulmazlık verir." } },
  "scum.NewPlayerProtectionDuration": { en: { label: "Protection Duration (min)", desc: "Minutes of protection after first spawn." }, tr: { label: "Koruma Süresi (dk)", desc: "İlk doğumdan sonra koruma dakikası." } },

  // ===== Economy Override =====
  "economy-logging": { en: { label: "Economy Logging", desc: "1 = write detailed economy events to log." }, tr: { label: "Ekonomi Log'u", desc: "1 = detaylı ekonomi olaylarını log'a yazar." } },
  "traders-unlimited-funds": { en: { label: "Traders: Unlimited Funds", desc: "1 = traders never run out of money." }, tr: { label: "Tüccar Sınırsız Para", desc: "1 = tüccarların parası tükenmez." } },
  "traders-unlimited-stock": { en: { label: "Traders: Unlimited Stock", desc: "1 = infinite item quantities." }, tr: { label: "Tüccar Sınırsız Stok", desc: "1 = sınırsız eşya miktarı." } },
  "gold-base-price": { en: { label: "Gold Base Price", desc: "-1 keeps default." }, tr: { label: "Altın Taban Fiyatı", desc: "-1 varsayılanı korur." } },
  "tradeable-rotation-enabled": { en: { label: "Tradeable Rotation", desc: "1 = items rotate on a schedule." }, tr: { label: "Eşya Rotasyonu", desc: "1 = eşyalar belirli aralıkla döner." } },
  "enable-fame-point-requirement": { en: { label: "Fame Requirement", desc: "1 = items may require minimum fame to buy." }, tr: { label: "Şöhret Gereksinimi", desc: "1 = eşyalar minimum şöhret gerektirebilir." } },

  // ===== Client GameUserSettings =====
  "scum.MasterVolume": { en: { label: "Master Volume", desc: "Overall audio volume (0-100)." }, tr: { label: "Ana Ses", desc: "Genel ses seviyesi (0-100)." } },
  "scum.FirstPersonFOV": { en: { label: "First-Person FOV", desc: "Field of view in FP mode (60-120)." }, tr: { label: "FP Görüş Açısı", desc: "Birinci şahıs görüş açısı (60-120)." } },
  "scum.ThirdPersonFOV": { en: { label: "Third-Person FOV", desc: "Field of view in TP mode." }, tr: { label: "TP Görüş Açısı", desc: "Üçüncü şahıs görüş açısı." } },
  "scum.Gamma": { en: { label: "Gamma", desc: "Screen brightness correction (1.0-4.0)." }, tr: { label: "Gamma", desc: "Ekran parlaklık düzeltmesi (1.0-4.0)." } },
  "scum.TextureQuality": { en: { label: "Texture Quality", desc: "0=Low, 1=Med, 2=High, 3=Ultra." }, tr: { label: "Doku Kalitesi", desc: "0=Düşük, 1=Orta, 2=Yüksek, 3=Ultra." } },
  "scum.ShadowQuality": { en: { label: "Shadow Quality", desc: "0=Low ... 3=Ultra." }, tr: { label: "Gölge Kalitesi", desc: "0=Düşük ... 3=Ultra." } },

  // ===== Wipe =====
  "scum.PartialWipe": { en: { label: "Partial Wipe", desc: "Reset some progression on next start." }, tr: { label: "Kısmi Sıfırlama", desc: "Sonraki başlatmada bazı ilerlemeleri sıfırlar." } },
  "scum.GoldWipe": { en: { label: "Gold Wipe", desc: "Reset all player gold on next start." }, tr: { label: "Altın Sıfırlama", desc: "Sonraki başlatmada tüm altınları sıfırlar." } },
  "scum.FullWipe": { en: { label: "Full Wipe", desc: "Complete world reset on next start." }, tr: { label: "Tam Sıfırlama", desc: "Sonraki başlatmada dünyayı tamamen sıfırlar." } },

  // ===== Respawn (more) =====
  "scum.SectorRespawnCooldown": { en: { label: "Sector Cooldown", desc: "Cooldown between sector respawns (HH:MM:SS)." }, tr: { label: "Sektör Bekleme", desc: "Sektör respawn'ları arasındaki bekleme." } },
  "scum.ShelterRespawnCooldown": { en: { label: "Shelter Cooldown", desc: "Cooldown between shelter respawns." }, tr: { label: "Barınak Bekleme", desc: "Barınak respawn bekleme süresi." } },
  "scum.SquadmateRespawnCooldown": { en: { label: "Squadmate Cooldown", desc: "Cooldown for squadmate respawn." }, tr: { label: "Takım Bekleme", desc: "Takım arkadaşı respawn bekleme süresi." } },
  "scum.RandomRespawnTime": { en: { label: "Random Respawn Delay", desc: "Time after death before random spawn." }, tr: { label: "Rastgele Respawn Gecikme", desc: "Ölümden sonra rastgele doğuma kadar süre." } },
  "scum.SectorRespawnTime": { en: { label: "Sector Respawn Delay", desc: "Time before sector-chosen spawn activates." }, tr: { label: "Sektör Respawn Gecikme", desc: "Sektör respawn aktivasyon süresi." } },
  "scum.ShelterRespawnTime": { en: { label: "Shelter Respawn Delay", desc: "Time before shelter spawn activates." }, tr: { label: "Barınak Respawn Gecikme", desc: "Barınak respawn aktivasyon süresi." } },
  "scum.SquadmateRespawnTime": { en: { label: "Squadmate Respawn Delay", desc: "Time before squadmate spawn activates." }, tr: { label: "Takım Respawn Gecikme", desc: "Takım respawn aktivasyon süresi." } },

  // ===== Damage (more) =====
  "scum.HumanToSentryDamageMultiplier": { en: { label: "Human → Sentry Damage", desc: "Damage players deal to sentries." }, tr: { label: "İnsan → Sentry Hasarı", desc: "Oyuncuların sentry'lere verdiği hasar." } },
  "scum.SentryToHumanDamageMultiplier": { en: { label: "Sentry → Human Damage", desc: "Damage sentries deal to players." }, tr: { label: "Sentry → İnsan Hasarı", desc: "Sentry'lerin oyunculara verdiği hasar." } },
  "scum.HumanToPuppetDamageMultiplier": { en: { label: "Human → Puppet Damage", desc: "Damage players deal to puppets." }, tr: { label: "İnsan → Zombi Hasarı", desc: "Oyuncuların zombilere verdiği hasar." } },
  "scum.ItemDecayDamageMultiplier": { en: { label: "Item Decay", desc: "How fast items degrade from use/time." }, tr: { label: "Eşya Çürüme", desc: "Eşya bozulma hızı." } },
  "scum.FoodDecayDamageMultiplier": { en: { label: "Food Decay", desc: "How fast food spoils." }, tr: { label: "Yiyecek Çürüme", desc: "Yiyecek bozulma hızı." } },
  "scum.BaseElementDamageMultiplier": { en: { label: "Base Element Damage", desc: "Damage dealt to base building pieces." }, tr: { label: "Üs Parça Hasarı", desc: "Üs inşa parçalarına verilen hasar." } },

  // ===== Skills (generic) =====
  "scum.ArcherySkillMultiplier": { en: { label: "Archery", desc: "XP multiplier for archery skill." }, tr: { label: "Okçuluk", desc: "Okçuluk yeteneği XP çarpanı." } },
  "scum.AviationSkillMultiplier": { en: { label: "Aviation", desc: "XP multiplier for aviation skill." }, tr: { label: "Havacılık", desc: "Havacılık yeteneği XP çarpanı." } },
  "scum.AwarenessSkillMultiplier": { en: { label: "Awareness", desc: "XP multiplier for awareness skill." }, tr: { label: "Farkındalık", desc: "Farkındalık XP çarpanı." } },
  "scum.BrawlingSkillMultiplier": { en: { label: "Brawling", desc: "XP multiplier for brawling skill." }, tr: { label: "Yumruk Kavga", desc: "Yumruk kavga XP çarpanı." } },
  "scum.CamouflageSkillMultiplier": { en: { label: "Camouflage", desc: "XP multiplier for camouflage skill." }, tr: { label: "Kamuflaj", desc: "Kamuflaj XP çarpanı." } },
  "scum.CookingSkillMultiplier": { en: { label: "Cooking", desc: "XP multiplier for cooking skill." }, tr: { label: "Aşçılık", desc: "Aşçılık XP çarpanı." } },
  "scum.DemolitionSkillMultiplier": { en: { label: "Demolition", desc: "XP multiplier for demolition." }, tr: { label: "Yıkım", desc: "Yıkım XP çarpanı." } },
  "scum.DrivingSkillMultiplier": { en: { label: "Driving", desc: "XP multiplier for driving skill." }, tr: { label: "Sürüş", desc: "Sürüş XP çarpanı." } },
  "scum.EnduranceSkillMultiplier": { en: { label: "Endurance", desc: "XP multiplier for endurance." }, tr: { label: "Dayanıklılık", desc: "Dayanıklılık XP çarpanı." } },
  "scum.EngineeringSkillMultiplier": { en: { label: "Engineering", desc: "XP multiplier for engineering." }, tr: { label: "Mühendislik", desc: "Mühendislik XP çarpanı." } },
  "scum.FarmingSkillMultiplier": { en: { label: "Farming", desc: "XP multiplier for farming." }, tr: { label: "Tarım", desc: "Tarım XP çarpanı." } },
  "scum.HandgunSkillMultiplier": { en: { label: "Handguns", desc: "XP multiplier for handguns." }, tr: { label: "Tabanca", desc: "Tabanca XP çarpanı." } },
  "scum.MedicalSkillMultiplier": { en: { label: "Medical", desc: "XP multiplier for medical skill." }, tr: { label: "Tıp", desc: "Tıp XP çarpanı." } },
  "scum.MeleeWeaponsSkillMultiplier": { en: { label: "Melee Weapons", desc: "XP multiplier for melee weapons." }, tr: { label: "Yakın Dövüş", desc: "Yakın dövüş XP çarpanı." } },
  "scum.MotorcycleSkillMultiplier": { en: { label: "Motorcycle", desc: "XP multiplier for motorcycle skill." }, tr: { label: "Motosiklet", desc: "Motosiklet XP çarpanı." } },
  "scum.RiflesSkillMultiplier": { en: { label: "Rifles", desc: "XP multiplier for rifles." }, tr: { label: "Tüfek", desc: "Tüfek XP çarpanı." } },
  "scum.RunningSkillMultiplier": { en: { label: "Running", desc: "XP multiplier for running." }, tr: { label: "Koşu", desc: "Koşu XP çarpanı." } },
  "scum.SnipingSkillMultiplier": { en: { label: "Sniping", desc: "XP multiplier for sniping." }, tr: { label: "Keskin Nişancı", desc: "Keskin nişancı XP çarpanı." } },
  "scum.StealthSkillMultiplier": { en: { label: "Stealth", desc: "XP multiplier for stealth." }, tr: { label: "Gizlilik", desc: "Gizlilik XP çarpanı." } },
  "scum.SurvivalSkillMultiplier": { en: { label: "Survival", desc: "XP multiplier for survival." }, tr: { label: "Hayatta Kalma", desc: "Hayatta kalma XP çarpanı." } },
  "scum.ThieverySkillMultiplier": { en: { label: "Thievery", desc: "XP multiplier for thievery." }, tr: { label: "Hırsızlık", desc: "Hırsızlık XP çarpanı." } },

  // ===== Economy (more) =====
  "economy-reset-time-hours": { en: { label: "Economy Reset (h)", desc: "Hours between full economy resets. -1 disables." }, tr: { label: "Ekonomi Sıfırlama (sa)", desc: "Tam ekonomi sıfırlama aralığı. -1 devre dışı." } },
  "prices-randomization-time-hours": { en: { label: "Price Shuffle (h)", desc: "Hours between price randomization. -1 disables." }, tr: { label: "Fiyat Karıştırma (sa)", desc: "Fiyat rastgele değişimi aralığı. -1 devre dışı." } },
  "tradeable-rotation-time-ingame-hours-min": { en: { label: "Rotation Min (in-game h)", desc: "Minimum in-game hours between item rotations." }, tr: { label: "Rotasyon Min (oyun sa)", desc: "Eşya rotasyonu minimum oyun saati." } },
  "tradeable-rotation-time-ingame-hours-max": { en: { label: "Rotation Max (in-game h)", desc: "Maximum in-game hours between rotations." }, tr: { label: "Rotasyon Maks (oyun sa)", desc: "Eşya rotasyonu maksimum oyun saati." } },
  "trader-funds-change-rate-per-hour-multiplier": { en: { label: "Trader Funds Regen Mult", desc: "How fast traders replenish funds." }, tr: { label: "Tüccar Para Yenileme", desc: "Tüccarların para yenilenme hızı." } },
  "prices-subject-to-player-count": { en: { label: "Dynamic Prices", desc: "1 = prices change with player count." }, tr: { label: "Dinamik Fiyat", desc: "1 = fiyatlar oyuncu sayısına göre değişir." } },
  "fully-restock-tradeable-hours": { en: { label: "Full Restock (h)", desc: "Hours until empty stock fully restocks." }, tr: { label: "Tam Stok (sa)", desc: "Boş stokun tamamen dolma süresi." } },
  "gold-price-subject-to-global-multiplier": { en: { label: "Gold ~ Global Mult", desc: "1 = gold price affected by global multiplier." }, tr: { label: "Altın ~ Global Çarpan", desc: "1 = altın fiyatı global çarpandan etkilenir." } },
  "global-only-after-player-sale-tradeable-availability-enabled": { en: { label: "After-Sale Availability", desc: "Items only appear after players sell them." }, tr: { label: "Satış Sonrası Erişim", desc: "Eşyalar sadece oyuncular sattıktan sonra görünür." } },
  "gold-sale-price-modifier": { en: { label: "Gold Sale Modifier", desc: "Modifier applied to gold sell price. -1 = default." }, tr: { label: "Altın Satış Çarpanı", desc: "Altın satış fiyatı çarpanı. -1 = varsayılan." } },
  "gold-price-change-percentage-step": { en: { label: "Gold % Step", desc: "Percentage step used for gold price changes." }, tr: { label: "Altın % Adım", desc: "Altın fiyat değişim yüzdesi adımı." } },
  "gold-price-change-per-step": { en: { label: "Gold Change per Step", desc: "How much gold price changes per step." }, tr: { label: "Adım Başına Değişim", desc: "Adım başına altın fiyat değişimi." } },

  // ===== Features (misc) =====
  "scum.EnableItemCooldownGroups": { en: { label: "Item Cooldown Groups", desc: "Enable cooldown groups for items." }, tr: { label: "Eşya Bekleme Grupları", desc: "Eşya grupları için bekleme süresi sistemi." } },
  "scum.ItemCooldownGroupsDurationMultiplier": { en: { label: "Item Cooldown Mult", desc: "Multiplier for cooldown group durations." }, tr: { label: "Bekleme Çarpanı", desc: "Bekleme grupları süre çarpanı." } },
  "scum.SpawnerProbabilityMultiplier": { en: { label: "Loot Spawn Chance", desc: "Chance of items spawning at containers." }, tr: { label: "Loot Oluşma Oranı", desc: "Kaplarda eşya oluşma oranı." } },
  "scum.SpawnerExpirationTimeMultiplier": { en: { label: "Loot Expiration Mult", desc: "How long spawned loot stays." }, tr: { label: "Loot Kalma Çarpanı", desc: "Oluşan loot'un kalma süresi." } },
  "scum.ExamineSpawnerProbabilityMultiplier": { en: { label: "Examine Loot Chance", desc: "Loot chance when examining containers." }, tr: { label: "İnceleme Loot Oranı", desc: "Kap incelediğinde loot oranı." } },

  // ===== Raid protection (more) =====
  "scum.RaidProtectionFlagSpecificChangeSettingCooldown": { en: { label: "Flag Setting Cooldown", desc: "Cooldown to change flag-specific settings." }, tr: { label: "Bayrak Ayar Bekleme", desc: "Bayrağa özel ayar değiştirme bekleme süresi." } },
  "scum.RaidProtectionFlagSpecificChangeSettingPrice": { en: { label: "Flag Setting Price", desc: "Price for changing flag-specific setting." }, tr: { label: "Bayrak Ayar Fiyatı", desc: "Bayrağa özel ayar değiştirme fiyatı." } },
  "scum.RaidProtectionFlagSpecificMaxProtectionTime": { en: { label: "Flag Max Protection", desc: "Max protection time per flag (HH:MM:SS)." }, tr: { label: "Bayrak Maks Koruma", desc: "Bayrak başına maks koruma süresi." } },
  "scum.RaidProtectionOfflineProtectionStartDelay": { en: { label: "Offline Protect Delay", desc: "Delay before offline protection starts." }, tr: { label: "Offline Koruma Gecikme", desc: "Offline koruma başlama gecikmesi." } },
  "scum.RaidProtectionOfflineMaxProtectionTime": { en: { label: "Offline Max Protect", desc: "Maximum offline protection time." }, tr: { label: "Offline Maks Koruma", desc: "Maksimum offline koruma süresi." } },

  // ===== Base building (more) =====
  "scum.ExtraElementsPerFlagForAdditionalSquadMember": { en: { label: "Extra Elements/Squadmate", desc: "Building element bonus per squadmate." }, tr: { label: "Takım Başı Ek Parça", desc: "Her takım üyesi için ek inşa parçası." } },
  "scum.MaximumNumberOfExpandedElementsPerFlag": { en: { label: "Max Expanded Elements", desc: "Cap on expanded elements per flag." }, tr: { label: "Maks Genişletilmiş Parça", desc: "Bayrak başına maks genişletilmiş parça." } },
  "scum.AllowFlagPlacementOnBBElements": { en: { label: "Flag on BB Elements", desc: "Allow placing flag on building pieces." }, tr: { label: "Bayrak İnşa Üstüne", desc: "İnşa parçası üstüne bayrak koymaya izin." } },
  "scum.AllowFloorPlacementOnHalfAndLowWalls": { en: { label: "Floor on Half Walls", desc: "Allow floor placement on short walls." }, tr: { label: "Alçak Duvarda Zemin", desc: "Alçak duvar üstüne zemin koyma izni." } },
  "scum.AllowWallPlacementOnHalfAndLowWalls": { en: { label: "Wall on Half Walls", desc: "Allow wall placement on short walls." }, tr: { label: "Alçak Duvarda Duvar", desc: "Alçak duvar üstüne duvar koyma izni." } },
  "scum.ChestAcquisitionDuration": { en: { label: "Chest Acquisition Time", desc: "Time to claim an unclaimed chest (HH:MM:SS)." }, tr: { label: "Sandık Sahiplenme Süresi", desc: "Sahipsiz sandığı alma süresi." } },

  // ===== Anti-cheat / Logs =====
  "scum.RustyLocksLogging": { en: { label: "Rusty Locks Log", desc: "Log all lockpicking attempts." }, tr: { label: "Kilit Kırma Log", desc: "Tüm kilit kırma denemelerini loglar." } },
  "scum.PlaySafeIdProtection": { en: { label: "PlaySafe ID Protection", desc: "Additional SteamID spoofing protection." }, tr: { label: "PlaySafe Kimlik Koruma", desc: "Ek SteamID sahteciliğine karşı koruma." } },
  "scum.DeleteInactiveUsers": { en: { label: "Auto-Delete Inactives", desc: "Delete users inactive for N days." }, tr: { label: "Pasif Kullanıcı Sil", desc: "N gündür pasif kullanıcıları siler." } },
  "scum.DaysSinceLastLoginToBecomeInactive": { en: { label: "Inactivity Threshold (days)", desc: "Days since last login before inactive." }, tr: { label: "Pasiflik Eşiği (gün)", desc: "Son girişten sonra pasif sayılma günü." } },
  "scum.DeleteBannedUsers": { en: { label: "Delete Banned Accounts", desc: "Remove banned users' data." }, tr: { label: "Yasaklıları Sil", desc: "Yasaklı kullanıcı verilerini kaldırır." } },
  "scum.LogChestOwnership": { en: { label: "Log Chest Ownership", desc: "Write chest ownership changes to log." }, tr: { label: "Sandık Sahipliği Log", desc: "Sandık sahipliği değişimlerini loglar." } },

  // ===== Vehicles (physics) =====
  "scum.FuelDrainFromEngineMultiplier": { en: { label: "Fuel Drain Mult", desc: "Engine fuel consumption multiplier." }, tr: { label: "Yakıt Tüketim Çarpanı", desc: "Motor yakıt tüketimi çarpanı." } },
  "scum.BatteryDrainFromEngineMultiplier": { en: { label: "Battery Drain (Engine)", desc: "Battery drain while engine runs." }, tr: { label: "Akü Tüketim (Motor)", desc: "Motor çalışırken akü tüketimi." } },
  "scum.BatteryDrainFromDevicesMultiplier": { en: { label: "Battery Drain (Devices)", desc: "Battery drain from accessories." }, tr: { label: "Akü Tüketim (Aksesuar)", desc: "Aksesuarlardan akü tüketimi." } },
  "scum.BatteryDrainFromInactivityMultiplier": { en: { label: "Battery Drain (Idle)", desc: "Battery drain while idle." }, tr: { label: "Akü Tüketim (Boşta)", desc: "Araç boştayken akü tüketimi." } },
  "scum.BatteryChargeWithAlternatorMultiplier": { en: { label: "Alternator Charge", desc: "Alternator charging rate." }, tr: { label: "Alternatör Şarj", desc: "Alternatör şarj hızı." } },
  "scum.BatteryChargeWithDynamoMultiplier": { en: { label: "Dynamo Charge", desc: "Dynamo charging rate." }, tr: { label: "Dinamo Şarj", desc: "Dinamo şarj hızı." } },
  "scum.MaximumTimeOfVehicleInactivity": { en: { label: "Max Inactivity (HH:MM:SS)", desc: "Time before abandoned vehicle is removed." }, tr: { label: "Maks Boşta (HH:MM:SS)", desc: "Terk edilen araçların kaldırılma süresi." } },
  "scum.MaximumTimeForVehiclesInForbiddenZones": { en: { label: "Max in Forbidden Zone", desc: "Time vehicles may stay in forbidden zones." }, tr: { label: "Yasak Bölgede Maks Süre", desc: "Araçların yasak bölgede kalma süresi." } },
  "scum.LogVehicleDestroyed": { en: { label: "Log Vehicle Destroyed", desc: "Write vehicle destruction events to log." }, tr: { label: "Araç Tahribatı Log", desc: "Araç tahribatlarını loglar." } },

  // ===== Cargo (more) =====
  "scum.CargoDropFallDelay": { en: { label: "Cargo Fall Delay (s)", desc: "Seconds before cargo actually falls." }, tr: { label: "Kargo Düşüş Gecikme (sn)", desc: "Kargonun gerçekten düşmesine kadar saniye." } },
  "scum.CargoDropFallDuration": { en: { label: "Cargo Fall Duration (s)", desc: "Duration of the cargo fall." }, tr: { label: "Kargo Düşüş Süresi (sn)", desc: "Kargo düşme animasyon süresi." } },
  "scum.CargoDropSelfdestructTime": { en: { label: "Cargo Self-destruct (s)", desc: "Seconds before unclaimed cargo destroys itself." }, tr: { label: "Kargo Kendini İmha (sn)", desc: "Sahipsiz kargonun kendini imha süresi." } },

  // ===== Bunkers =====
  "scum.AbandonedBunkerMaxSimultaneouslyActive": { en: { label: "Max Active Bunkers", desc: "Max simultaneously-open abandoned bunkers." }, tr: { label: "Aktif Sığınak Sayısı", desc: "Aynı anda açık maks terk edilmiş sığınak." } },
  "scum.AbandonedBunkerActiveDurationHours": { en: { label: "Bunker Active Hours", desc: "Hours a bunker stays accessible." }, tr: { label: "Sığınak Açık Süre", desc: "Sığınağın açık kalma saati." } },
  "scum.AbandonedBunkerKeyCardActiveDurationHours": { en: { label: "Bunker KeyCard Hours", desc: "Hours bunker keycard stays active." }, tr: { label: "Kart Aktif Süre", desc: "Sığınak kartının aktif kalma saati." } },
  "scum.MaxAllowedKillboxKeycards": { en: { label: "Max Killbox Keycards", desc: "Total killbox keycards on map." }, tr: { label: "Maks Killbox Kart", desc: "Haritada toplam killbox kart sayısı." } },

  // ===== Encounters (more) =====
  "scum.EncounterBaseCharacterAmountMultiplier": { en: { label: "Base Encounter Amount", desc: "Base multiplier for encounter character count." }, tr: { label: "Karşılaşma Taban", desc: "Karşılaşma karakter sayısı taban çarpanı." } },
  "scum.EncounterExtraCharacterPerPlayerMultiplier": { en: { label: "Extra per Player", desc: "Additional characters per online player." }, tr: { label: "Oyuncu Başı Ek", desc: "Online oyuncu başına ek karakter." } },
  "scum.EncounterCharacterRespawnTimeMultiplier": { en: { label: "Encounter Respawn Mult", desc: "Respawn time multiplier for encounter characters." }, tr: { label: "Karşılaşma Respawn", desc: "Karşılaşma karakterleri respawn çarpanı." } },
  "scum.EncounterHordeActivationChanceMultiplier": { en: { label: "Horde Activation Chance", desc: "Chance of horde events triggering." }, tr: { label: "Sürü Tetikleme Oranı", desc: "Zombi sürüsü olayı tetikleme oranı." } },
  "scum.EncounterNeverRespawnCharacters": { en: { label: "Never Respawn", desc: "1 = encounter characters do not respawn." }, tr: { label: "Respawn Yok", desc: "1 = karşılaşma karakterleri respawn olmaz." } },

  // ===== Quests (more) =====
  "scum.QuestsGlobalCycleDuration": { en: { label: "Quest Cycle Duration", desc: "Duration of a global quest cycle." }, tr: { label: "Görev Döngü Süresi", desc: "Global görev döngüsü süresi." } },
  "scum.MaxSimultaneousQuestsPerTrader": { en: { label: "Max Simultaneous/Trader", desc: "Max simultaneous quests per trader." }, tr: { label: "Tüccar Eşzamanlı Max", desc: "Tüccar başına eşzamanlı maks görev." } },

  // ===== Map =====
  "scum.CustomMapEnabled": { en: { label: "Custom Map", desc: "Enable custom playable area bounds." }, tr: { label: "Özel Harita", desc: "Özel oynanabilir alan sınırlarını açar." } },

  // ===== Squad =====
  "scum.SquadMemberCountAtIntLevel2": { en: { label: "Squad Size — Int 2", desc: "Max squad size at Intelligence 2." }, tr: { label: "Takım · Zeka 2", desc: "Zeka 2'de maks takım boyutu." } },
  "scum.SquadMemberCountAtIntLevel3": { en: { label: "Squad Size — Int 3", desc: "Max squad size at Intelligence 3." }, tr: { label: "Takım · Zeka 3", desc: "Zeka 3'de maks takım boyutu." } },
  "scum.SquadMemberCountAtIntLevel4": { en: { label: "Squad Size — Int 4", desc: "Max squad size at Intelligence 4." }, tr: { label: "Takım · Zeka 4", desc: "Zeka 4'de maks takım boyutu." } },

  // ===== Client Graphics (more) =====
  "scum.RenderScale": { en: { label: "Render Scale", desc: "Internal render resolution scale (0.5-2.0)." }, tr: { label: "Render Ölçeği", desc: "Dahili render çözünürlük ölçeği (0.5-2.0)." } },
  "scum.MotionBlur": { en: { label: "Motion Blur", desc: "0 = off, 1 = on." }, tr: { label: "Hareket Bulanıklığı", desc: "0 = kapalı, 1 = açık." } },
  "scum.ViewDistance": { en: { label: "View Distance", desc: "0 = low ... 3 = epic." }, tr: { label: "Görüş Mesafesi", desc: "0 = düşük ... 3 = epic." } },
  "scum.FoliageQuality": { en: { label: "Foliage Quality", desc: "0 = low ... 3 = epic." }, tr: { label: "Bitki Örtüsü", desc: "0 = düşük ... 3 = epic." } },
  "scum.PostProcessingQuality": { en: { label: "Post-Processing", desc: "0 = low ... 3 = epic." }, tr: { label: "Post-Processing", desc: "0 = düşük ... 3 = epic." } },
  "scum.EffectsQuality": { en: { label: "Effects Quality", desc: "0 = low ... 3 = epic." }, tr: { label: "Efekt Kalitesi", desc: "0 = düşük ... 3 = epic." } },

  // ===== Client Game =====
  "scum.NudityCensoring": { en: { label: "Nudity Censoring", desc: "Client-side nudity censoring." }, tr: { label: "Çıplaklık Sansürü", desc: "İstemci tarafı çıplaklık sansürü." } },
  "scum.ShowSimpleTooltipOnHover": { en: { label: "Simple Tooltips", desc: "Show simplified tooltips on hover." }, tr: { label: "Basit Tooltip", desc: "Hover'da basit tooltip gösterir." } },
  "scum.EnableDeena": { en: { label: "Enable Deena", desc: "Enable Deena assistant." }, tr: { label: "Deena'yı Aç", desc: "Deena asistanını açar." } },
  "scum.AutoStartFirstDeenaTask": { en: { label: "Auto Deena Task", desc: "Auto-start first Deena task." }, tr: { label: "İlk Deena Görevi", desc: "İlk Deena görevini otomatik başlatır." } },
  "scum.ShowAnnouncementMessages": { en: { label: "Show Announcements", desc: "Show in-game announcements." }, tr: { label: "Duyuruları Göster", desc: "Oyun içi duyuruları gösterir." } },
  "scum.NametagMode": { en: { label: "Nametag Mode", desc: "0 = off, 1 = friendlies only, 2 = all." }, tr: { label: "İsim Etiketi", desc: "0 = kapalı, 1 = sadece takım, 2 = hepsi." } },
  "scum.AimDownSightsMode": { en: { label: "ADS Hold Mode", desc: "Hold vs toggle to aim." }, tr: { label: "ADS Mod", desc: "Basılı tut / aç-kapa nişan alma." } },

  // ===== Essentials (more) =====
  "scum.MasterServerUpdateSendInterval": { en: { label: "Master Server Sync (s)", desc: "Seconds between master server updates." }, tr: { label: "Master Server Sync (sn)", desc: "Master server güncelleme aralığı." } },
  "scum.LogoutTimerInBunker": { en: { label: "Logout in Bunker (s)", desc: "Extended logout timer in bunkers." }, tr: { label: "Sığınakta Çıkış (sn)", desc: "Sığınakta uzatılmış çıkış süresi." } },
  "scum.HideKillNotification": { en: { label: "Hide Kill Notification", desc: "Do not broadcast kills to chat." }, tr: { label: "Kill Bildirimi Gizle", desc: "Kill bildirimlerini chat'e atmaz." } },
  "scum.DisableExamineGhost": { en: { label: "Disable Examine Ghost", desc: "Disable ghost-view of examined items." }, tr: { label: "İnceleme Ghost Kapat", desc: "İncelenen eşyalar için hayalet görünümü kapatır." } },
  "scum.LogSuicides": { en: { label: "Log Suicides", desc: "Write suicide events to server log." }, tr: { label: "İntihar Log", desc: "İntihar olaylarını loglar." } },
  "scum.EnableSpawnOnGround": { en: { label: "Ground Spawn", desc: "Allow ground-based initial spawn." }, tr: { label: "Zeminde Doğma", desc: "Zemin tabanlı ilk doğuma izin verir." } },
};

export const getFieldMeta = (key, lang = "en") => {
  const meta = FIELD_META[key];
  if (!meta) return null;
  return meta[lang] || meta.en;
};
