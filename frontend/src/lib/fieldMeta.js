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
};

export const getFieldMeta = (key, lang = "en") => {
  const meta = FIELD_META[key];
  if (!meta) return null;
  return meta[lang] || meta.en;
};
