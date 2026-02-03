import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "zh-TW" | "zh-CN";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Translations
const translations: Record<Language, Record<string, string>> = {
  en: {
    // Brand
    "app.name": "huddle",
    "app.subheadline": "Pet care & social",
    
    // Navigation
    "nav.home": "Home",
    "nav.social": "Social",
    "nav.chats": "Chats",
    "nav.ai_vet": "AI Vet",
    "nav.map": "Map",
    
    // Global Header
    "header.free": "Free",
    "header.premium": "Premium",
    "header.upgrade": "Upgrade",
    
    // Home
    "home.greeting": "Hi, {name}! 👋",
    "home.subtitle": "Let's care for your pets",
    "home.wisdom": "Huddle Wisdom",
    "home.next_event": "Next Event",
    
    // Social
    "social.discovery": "Discovery",
    "social.nearby": "Huddle Nearby",
    "social.nannies": "Nannies",
    "social.playdates": "Playdates",
    "social.animal_lovers": "Animal Lovers",
    "social.verified": "Verified",
    "social.support": "Support",
    "social.report": "Report",
    "social.hide": "Hide",
    "social.wave": "Wave",
    "social.match": "Double Wave!",
    
    // Dr. Huddle / AI Vet
    "ai.name": "Dr. Huddle",
    "ai.online": "Online",
    "ai.analyzing": "Analyzing for",
    "ai.disclaimer": "Dr. Huddle is an AI assistant for informational purposes only. Information provided can be wrong. Always seek professional veterinary opinions. Visit a clinic immediately if you have doubts or an emergency.",
    "ai.placeholder": "Type a message...",
    "ai.attach_pet": "Attach Pet Profile",
    
    // Map
    "map.search": "Find dog parks, vets, or friends...",
    "map.filter_all": "All",
    "map.filter_stray": "Stray",
    "map.filter_lost": "Lost",
    "map.filter_found": "Found",
    "map.filter_friends": "Friends",
    "map.filter_others": "Others",
    "map.go_online": "Go Online",
    "map.broadcast": "Broadcast Alert",
    "map.broadcast_remark": "Broadcasts to online users within {distance} miles; active for 48 hours.",
    "map.call_now": "Call Now",
    "map.navigate": "Navigate",
    "map.found_btn": "Found",
    "map.remove_pin": "Remove Pin?",
    "map.24h": "24h",
    
    // Chats
    "chats.title": "Chats",
    "chats.new_huddles": "New Huddles",
    "chats.create_group": "Create Group",
    "chats.group_name": "Group Name",
    "chats.add_members": "Add Members",
    "chats.allow_control": "Allow members to manage group",
    
    // Settings
    "settings.title": "Settings",
    "settings.profile": "Profile",
    "settings.account_security": "Account & Security",
    "settings.personal_info": "Personal Info",
    "settings.password": "Password",
    "settings.biometric": "Biometric Login",
    "settings.2fa": "Two-Factor Auth",
    "settings.privacy": "Privacy",
    "settings.private_account": "Private Account",
    "settings.map_visibility": "Map Visibility",
    "settings.trusted_locations": "Trusted Locations",
    "settings.notifications": "Notifications",
    "settings.pause_all": "Pause All",
    "settings.social_notif": "Social (Waves/Matches)",
    "settings.safety_notif": "Safety (Alerts)",
    "settings.ai_notif": "Dr. Huddle",
    "settings.email_notif": "Email Notifications",
    "settings.language": "Language",
    "settings.help_support": "Help & Support",
    "settings.report_bug": "Report a Bug",
    "settings.privacy_policy": "Privacy Policy",
    "settings.terms": "Terms of Service",
    "settings.deactivate": "Deactivate Account",
    "settings.delete": "Delete Account",
    "settings.logout": "Logout",
    "settings.pending": "Identity pending",
    "settings.verified_badge": "Verified huddler",
    
    // Profile
    "profile.edit": "Edit Profile",
    "profile.display_name": "Display Name",
    "profile.bio": "Bio",
    "profile.gender": "Gender",
    "profile.genre": "Genre/Orientation",
    "profile.dob": "Date of Birth",
    "profile.height": "Height",
    "profile.degree": "Highest Degree",
    "profile.occupation": "Occupation",
    "profile.school": "School",
    "profile.major": "Major",
    "profile.affiliation": "Affiliation",
    "profile.has_car": "Own a Car?",
    "profile.owns_pets": "Currently own pets?",
    "profile.show": "Show",
    
    // Pet Profile
    "pet.title": "Pet Profile",
    "pet.basics": "Basics",
    "pet.vault": "The Vault",
    "pet.lifestyle": "Lifestyle",
    "pet.name": "Name",
    "pet.species": "Species",
    "pet.breed": "Breed",
    "pet.gender": "Gender",
    "pet.weight": "Weight",
    "pet.dob": "Date of Birth",
    "pet.vaccinations": "Vaccinations",
    "pet.medications": "Medications",
    "pet.microchip": "Microchip ID",
    "pet.vet_contact": "Vet Contact",
    "pet.temperament": "Temperament",
    "pet.routine": "Routine",
    
    // Premium
    "premium.title": "Huddle Premium",
    "premium.unlock": "Unlock the full experience",
    "premium.upgrade": "Upgrade to Premium",
    "premium.maybe_later": "Maybe later",
    "premium.compare": "Compare Plans",
    "premium.free_plan": "Free",
    "premium.premium_plan": "Premium",
    "premium.grey_badge": "Grey Badge",
    "premium.gold_badge": "Gold Badge",
    "premium.text_ai": "Text AI",
    "premium.photo_audio_ai": "Photo/Audio AI",
    "premium.alert_1mi": "1-mile Alert",
    "premium.alert_5mi": "5-mile Alert",
    "premium.single_filter": "Single Filter",
    "premium.multi_filter": "Multi-select Filters",
    "premium.ghost_mode": "Ghost Mode",
    "premium.featured": "Featured Posting",
    

    // Nanny Booking Modal
    "booking.title": "Book Nanny",
    "booking.pet_nanny": "Pet Nanny",
    "booking.service_date": "Service Date",
    "booking.start_time": "Start Time",
    "booking.end_time": "End Time",
    "booking.which_pet": "Which Pet?",
    "booking.select_pet": "Select a pet…",
    "booking.location": "Service Location",
    "booking.location_not_set": "Set location in your profile",
    "booking.amount": "Booking Amount (USD)",
    "booking.amount_note": "Minimum $10 · Payment held in escrow until service completed",
    "booking.cancel": "Cancel",
    "booking.pay": "Pay via Stripe",
    // Common
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.delete": "Delete",
    "common.create": "Create",
    "common.add": "Add",
    "common.remove": "Remove",
    "common.close": "Close",
    "common.loading": "Loading...",
    "common.error": "Error",
    "common.success": "Success",
    "common.others": "Others",
  },
  "zh-TW": {
    // Brand
    "app.name": "huddle",
    "app.subheadline": "寵物照護與社交",
    
    // Navigation
    "nav.home": "首頁",
    "nav.social": "社交",
    "nav.chats": "聊天",
    "nav.ai_vet": "AI 獸醫",
    "nav.map": "地圖",
    
    // Global Header
    "header.free": "免費版",
    "header.premium": "星級會員",
    "header.upgrade": "升級",
    
    // Home
    "home.greeting": "嗨，{name}！👋",
    "home.subtitle": "一起照顧你的毛孩",
    "home.wisdom": "毛孩百科",
    "home.next_event": "下一個活動",
    
    // Social
    "social.discovery": "探索",
    "social.nearby": "附近的Huddler",
    "social.nannies": "暖心保姆",
    "social.playdates": "毛孩聚會",
    "social.animal_lovers": "動物之友",
    "social.verified": "已認證",
    "social.support": "支持",
    "social.report": "檢舉",
    "social.hide": "隱藏",
    "social.wave": "打招呼",
    "social.match": "雙向打招呼！",
    
    // Dr. Huddle / AI Vet
    "ai.name": "Huddle AI 醫生",
    "ai.online": "線上",
    "ai.analyzing": "正在分析",
    "ai.disclaimer": "Huddle AI 醫生是僅供參考的人工智慧助手。提供的資訊可能有誤。請務必尋求專業獸醫意見。如有疑慮或緊急情況，請立即前往診所。",
    "ai.placeholder": "輸入訊息...",
    "ai.attach_pet": "附加寵物資料",
    
    // Map
    "map.search": "搜尋狗公園、獸醫或朋友...",
    "map.filter_all": "全部",
    "map.filter_stray": "流浪動物",
    "map.filter_lost": "走失寵物",
    "map.filter_found": "已找到",
    "map.filter_friends": "朋友",
    "map.filter_others": "其他",
    "map.go_online": "上線",
    "map.broadcast": "緊急通報",
    "map.broadcast_remark": "通報將發送給{distance}英里內的線上用戶；有效期48小時。",
    "map.call_now": "立即撥打",
    "map.navigate": "導航",
    "map.found_btn": "已找到",
    "map.remove_pin": "移除標記？",
    "map.24h": "24小時",
    
    // Chats
    "chats.title": "聊天",
    "chats.new_huddles": "新朋友",
    "chats.create_group": "建立群組",
    "chats.group_name": "群組名稱",
    "chats.add_members": "新增成員",
    "chats.allow_control": "允許成員管理群組",
    
    // Settings
    "settings.title": "設定",
    "settings.profile": "個人資料",
    "settings.account_security": "帳號與安全",
    "settings.personal_info": "個人資訊",
    "settings.password": "密碼",
    "settings.biometric": "生物辨識登入",
    "settings.2fa": "雙重驗證",
    "settings.privacy": "隱私",
    "settings.private_account": "私人帳號",
    "settings.map_visibility": "地圖可見度",
    "settings.trusted_locations": "信任的位置",
    "settings.notifications": "通知",
    "settings.pause_all": "暫停所有通知",
    "settings.social_notif": "社交（打招呼/配對）",
    "settings.safety_notif": "安全（警報）",
    "settings.ai_notif": "Huddle AI 醫生",
    "settings.email_notif": "電子郵件通知",
    "settings.language": "語言",
    "settings.help_support": "說明與支援",
    "settings.report_bug": "回報問題",
    "settings.privacy_policy": "隱私權政策",
    "settings.terms": "服務條款",
    "settings.deactivate": "停用帳號",
    "settings.delete": "刪除帳號",
    "settings.logout": "登出",
    "settings.pending": "身份驗證中",
    "settings.verified_badge": "認證huddler",
    
    // Profile
    "profile.edit": "編輯個人資料",
    "profile.display_name": "顯示名稱",
    "profile.bio": "簡介",
    "profile.gender": "性別",
    "profile.genre": "性向",
    "profile.dob": "出生日期",
    "profile.height": "身高",
    "profile.degree": "最高學歷",
    "profile.occupation": "職業",
    "profile.school": "學校",
    "profile.major": "主修",
    "profile.affiliation": "隸屬組織",
    "profile.has_car": "有車？",
    "profile.owns_pets": "目前有養寵物？",
    "profile.show": "顯示",
    
    // Pet Profile
    "pet.title": "養寵資料",
    "pet.basics": "基本資料",
    "pet.vault": "健康記錄",
    "pet.lifestyle": "生活習慣",
    "pet.name": "名字",
    "pet.species": "種類",
    "pet.breed": "品種",
    "pet.gender": "性別",
    "pet.weight": "體重",
    "pet.dob": "出生日期",
    "pet.vaccinations": "疫苗接種",
    "pet.medications": "用藥",
    "pet.microchip": "晶片號碼",
    "pet.vet_contact": "獸醫聯絡方式",
    "pet.temperament": "性格",
    "pet.routine": "日常作息",
    
    // Premium
    "premium.title": "Huddle 星級會員",
    "premium.unlock": "解鎖完整體驗",
    "premium.upgrade": "成為星級huddler",
    "premium.maybe_later": "稍後再說",
    "premium.compare": "方案比較",
    "premium.free_plan": "免費版",
    "premium.premium_plan": "星級會員",
    "premium.grey_badge": "灰色徽章",
    "premium.gold_badge": "金色徽章",
    "premium.text_ai": "文字AI",
    "premium.photo_audio_ai": "照片/語音AI",
    "premium.alert_1mi": "1英里警報",
    "premium.alert_5mi": "5英里警報",
    "premium.single_filter": "單一篩選",
    "premium.multi_filter": "多重篩選",
    "premium.ghost_mode": "隱身模式",
    "premium.featured": "精選刊登",
    

    // Nanny Booking Modal
    "booking.title": "預約保姆",
    "booking.pet_nanny": "寵物保姆",
    "booking.service_date": "服務日期",
    "booking.start_time": "開始時間",
    "booking.end_time": "結束時間",
    "booking.which_pet": "哪隻寵物？",
    "booking.select_pet": "請選擇寵物…",
    "booking.location": "服務地點",
    "booking.location_not_set": "請在個人資料中設定地點",
    "booking.amount": "預約金額（美元）",
    "booking.amount_note": "最低 $10 · 金額將托管至服務完成",
    "booking.cancel": "取消",
    "booking.pay": "前往付款",
    // Common
    "common.save": "儲存",
    "common.cancel": "取消",
    "common.confirm": "確認",
    "common.delete": "刪除",
    "common.create": "建立",
    "common.add": "新增",
    "common.remove": "移除",
    "common.close": "關閉",
    "common.loading": "載入中...",
    "common.error": "錯誤",
    "common.success": "成功",
    "common.others": "其他",
  },
  "zh-CN": {
    // Brand
    "app.name": "huddle",
    "app.subheadline": "宠物照护与社交",
    
    // Navigation
    "nav.home": "首页",
    "nav.social": "社交",
    "nav.chats": "聊天",
    "nav.ai_vet": "AI 兽医",
    "nav.map": "地图",
    
    // Global Header
    "header.free": "免费版",
    "header.premium": "星级会员",
    "header.upgrade": "升级",
    
    // Home
    "home.greeting": "嗨，{name}！👋",
    "home.subtitle": "一起照顾你的毛孩",
    "home.wisdom": "毛孩百科",
    "home.next_event": "下一个活动",
    
    // Social
    "social.discovery": "探索",
    "social.nearby": "附近的Huddler",
    "social.nannies": "暖心保姆",
    "social.playdates": "毛孩聚会",
    "social.animal_lovers": "动物之友",
    "social.verified": "已认证",
    "social.support": "支持",
    "social.report": "举报",
    "social.hide": "隐藏",
    "social.wave": "打招呼",
    "social.match": "双向打招呼！",
    
    // Dr. Huddle / AI Vet
    "ai.name": "Huddle AI 医生",
    "ai.online": "在线",
    "ai.analyzing": "正在分析",
    "ai.disclaimer": "Huddle AI 医生是仅供参考的人工智能助手。提供的信息可能有误。请务必寻求专业兽医意见。如有疑虑或紧急情况，请立即前往诊所。",
    "ai.placeholder": "输入消息...",
    "ai.attach_pet": "附加宠物资料",
    
    // Map
    "map.search": "搜索狗公园、兽医或朋友...",
    "map.filter_all": "全部",
    "map.filter_stray": "流浪动物",
    "map.filter_lost": "走失宠物",
    "map.filter_found": "已找到",
    "map.filter_friends": "朋友",
    "map.filter_others": "其他",
    "map.go_online": "上线",
    "map.broadcast": "紧急通报",
    "map.broadcast_remark": "通报将发送给{distance}英里内的在线用户；有效期48小时。",
    "map.call_now": "立即拨打",
    "map.navigate": "导航",
    "map.found_btn": "已找到",
    "map.remove_pin": "移除标记？",
    "map.24h": "24小时",
    
    // Chats
    "chats.title": "聊天",
    "chats.new_huddles": "新朋友",
    "chats.create_group": "创建群组",
    "chats.group_name": "群组名称",
    "chats.add_members": "添加成员",
    "chats.allow_control": "允许成员管理群组",
    
    // Settings
    "settings.title": "设置",
    "settings.profile": "个人资料",
    "settings.account_security": "账号与安全",
    "settings.personal_info": "个人信息",
    "settings.password": "密码",
    "settings.biometric": "生物识别登录",
    "settings.2fa": "双重验证",
    "settings.privacy": "隐私",
    "settings.private_account": "私人账号",
    "settings.map_visibility": "地图可见度",
    "settings.trusted_locations": "信任的位置",
    "settings.notifications": "通知",
    "settings.pause_all": "暂停所有通知",
    "settings.social_notif": "社交（打招呼/配对）",
    "settings.safety_notif": "安全（警报）",
    "settings.ai_notif": "Huddle AI 医生",
    "settings.email_notif": "电子邮件通知",
    "settings.language": "语言",
    "settings.help_support": "帮助与支持",
    "settings.report_bug": "报告问题",
    "settings.privacy_policy": "隐私政策",
    "settings.terms": "服务条款",
    "settings.deactivate": "停用账号",
    "settings.delete": "删除账号",
    "settings.logout": "登出",
    "settings.pending": "身份验证中",
    "settings.verified_badge": "认证huddler",
    
    // Profile
    "profile.edit": "编辑个人资料",
    "profile.display_name": "显示名称",
    "profile.bio": "简介",
    "profile.gender": "性别",
    "profile.genre": "性向",
    "profile.dob": "出生日期",
    "profile.height": "身高",
    "profile.degree": "最高学历",
    "profile.occupation": "职业",
    "profile.school": "学校",
    "profile.major": "专业",
    "profile.affiliation": "隶属组织",
    "profile.has_car": "有车？",
    "profile.owns_pets": "目前有养宠物？",
    "profile.show": "显示",
    
    // Pet Profile
    "pet.title": "养宠资料",
    "pet.basics": "基本资料",
    "pet.vault": "健康记录",
    "pet.lifestyle": "生活习惯",
    "pet.name": "名字",
    "pet.species": "种类",
    "pet.breed": "品种",
    "pet.gender": "性别",
    "pet.weight": "体重",
    "pet.dob": "出生日期",
    "pet.vaccinations": "疫苗接种",
    "pet.medications": "用药",
    "pet.microchip": "芯片号码",
    "pet.vet_contact": "兽医联系方式",
    "pet.temperament": "性格",
    "pet.routine": "日常作息",
    
    // Premium
    "premium.title": "Huddle 星级会员",
    "premium.unlock": "解锁完整体验",
    "premium.upgrade": "成为星级huddler",
    "premium.maybe_later": "稍后再说",
    "premium.compare": "方案比较",
    "premium.free_plan": "免费版",
    "premium.premium_plan": "星级会员",
    "premium.grey_badge": "灰色徽章",
    "premium.gold_badge": "金色徽章",
    "premium.text_ai": "文字AI",
    "premium.photo_audio_ai": "照片/语音AI",
    "premium.alert_1mi": "1英里警报",
    "premium.alert_5mi": "5英里警报",
    "premium.single_filter": "单一筛选",
    "premium.multi_filter": "多重筛选",
    "premium.ghost_mode": "隐身模式",
    "premium.featured": "精选刊登",
    

    // Nanny Booking Modal
    "booking.title": "预约保姆",
    "booking.pet_nanny": "宠物保姆",
    "booking.service_date": "服务日期",
    "booking.start_time": "开始时间",
    "booking.end_time": "结束时间",
    "booking.which_pet": "哪只宠物？",
    "booking.select_pet": "请选择宠物…",
    "booking.location": "服务地点",
    "booking.location_not_set": "请在个人资料中设置地点",
    "booking.amount": "预约金额（美元）",
    "booking.amount_note": "最低 $10 · 金额将托管至服务完成",
    "booking.cancel": "取消",
    "booking.pay": "前往付款",
    // Common
    "common.save": "保存",
    "common.cancel": "取消",
    "common.confirm": "确认",
    "common.delete": "删除",
    "common.create": "创建",
    "common.add": "添加",
    "common.remove": "移除",
    "common.close": "关闭",
    "common.loading": "加载中...",
    "common.error": "错误",
    "common.success": "成功",
    "common.others": "其他",
  },
};

// Detect device language
const detectLanguage = (): Language => {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("zh-tw") || browserLang.startsWith("zh-hant")) {
    return "zh-TW";
  } else if (browserLang.startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("huddle_language");
    if (saved && (saved === "en" || saved === "zh-TW" || saved === "zh-CN")) {
      return saved as Language;
    }
    return detectLanguage();
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("huddle_language", lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  useEffect(() => {
    document.documentElement.lang = language === "zh-TW" ? "zh-Hant" : language === "zh-CN" ? "zh-Hans" : "en";
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
