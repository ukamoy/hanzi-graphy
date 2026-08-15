-- hanzi-graphy 迁移：SQLite(better-sqlite3) -> Supabase Postgres
-- 在 Supabase 控制台 -> SQL Editor 中整体执行本文件（一次即可）。

-- =====================================================================
-- 1. 表结构
-- =====================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'student',
  created_at bigint not null
);

create table public.courses (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  number integer not null,
  chars jsonb not null,
  source text not null default 'default',
  library_name text,
  created_at bigint not null,
  completed_at bigint
);

create table public.practice_records (
  practice_key text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null references public.courses (id) on delete cascade,
  character text not null,
  paths jsonb not null default '[]',
  score double precision,
  quiz jsonb,
  updated_at bigint not null
);

create table public.grade_texts (
  id text primary key,
  name text not null,
  chars text not null
);

create table public.app_config (
  key text primary key,
  value text not null
);

create index idx_courses_user_id on public.courses (user_id);
create index idx_practice_records_user_id on public.practice_records (user_id);
create index idx_practice_records_course_id on public.practice_records (course_id);

-- =====================================================================
-- 2. 注册触发器：新用户在 auth.users 创建时自动写入 profiles（role=student）
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, created_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    'student',
    (extract(epoch from now()) * 1000)::bigint
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
-- 3. 管理员判断函数（安全：security definer 绕过 RLS，避免递归）
-- =====================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- =====================================================================
-- 4. RLS 策略
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.practice_records enable row level security;
alter table public.grade_texts enable row level security;
alter table public.app_config enable row level security;

-- profiles
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- courses
create policy "courses_select_own_or_admin" on public.courses
  for select using (user_id = auth.uid() or public.is_admin());
create policy "courses_insert_own_or_admin" on public.courses
  for insert with check (user_id = auth.uid() or public.is_admin());
create policy "courses_update_own_or_admin" on public.courses
  for update using (user_id = auth.uid() or public.is_admin());
create policy "courses_delete_own_or_admin" on public.courses
  for delete using (user_id = auth.uid() or public.is_admin());

-- practice_records
create policy "records_select_own_or_admin" on public.practice_records
  for select using (user_id = auth.uid() or public.is_admin());
create policy "records_insert_own_or_admin" on public.practice_records
  for insert with check (user_id = auth.uid() or public.is_admin());
create policy "records_update_own_or_admin" on public.practice_records
  for update using (user_id = auth.uid() or public.is_admin());
create policy "records_delete_own_or_admin" on public.practice_records
  for delete using (user_id = auth.uid() or public.is_admin());

-- grade_texts（所有人可读，仅管理员可写）
create policy "grade_texts_select_all" on public.grade_texts
  for select using (true);
create policy "grade_texts_insert_admin" on public.grade_texts
  for insert with check (public.is_admin());
create policy "grade_texts_update_admin" on public.grade_texts
  for update using (public.is_admin());
create policy "grade_texts_delete_admin" on public.grade_texts
  for delete using (public.is_admin());

-- app_config（所有人可读，仅管理员可写）
create policy "app_config_select_all" on public.app_config
  for select using (true);
create policy "app_config_update_admin" on public.app_config
  for update using (public.is_admin());

-- =====================================================================
-- 5. 原子替换年级字库（管理员操作）
-- =====================================================================

create or replace function public.replace_grade_texts(texts jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  delete from public.grade_texts;
  insert into public.grade_texts (id, name, chars)
  select (t ->> 'id'), (t ->> 'name'), coalesce((t ->> 'chars'), '')
  from jsonb_array_elements(texts) as t;
end;
$$;

-- =====================================================================
-- 6. 种子数据
-- =====================================================================

insert into public.grade_texts (id, name, chars) values
('grade-1-1', '一年级上册', '一二三十木禾上下土个八入大天人火文六七儿九无口日中了子门月不开四五目耳头米见白田电也长山出飞马鸟云公车牛羊小少巾牙尺毛卜又心风力手水广升足走方半巴业本平书自已东西回片皮生里果几用鱼今正雨两瓜衣来年左右'),
('grade-1-2', '一年级下册', '万丁冬百齐说话朋友春高你们红绿花草爷节岁亲的行古声多处知忙洗认扫真父母爸全关写完家看着画笑兴会妈奶午合放收女太气早去亮和语千李秀香听唱连远定向以后更主意总先干赶起明净同工专才级队蚂蚁前空房网诗林童黄闭立是朵美我叶机她他送过时让吗吧虫往得很河姐借呢呀哪谁怕跟凉量最园因为脸阳光可石办法找许别到那都吓叫再象像做点照沙海桥竹军苗井乡面忘想念王从边这进道贝原男爱虾跑吹地快乐老师短对冷淡热情拉把给活种吃练习苦学非常问间伙伴共汽分要没位孩选北南江湖秋只星雪帮请就球玩跳桃树刚兰各坐座带急名发成晚动新有在什么变条'),
('grade-2-1', '二年级上册', '宜实色华谷金尽层丰壮波浪灯作字苹丽劳尤其区巨它安块站已甲豆识纷经如好娃洼于首枝枫记刘胡戏棋钢观弹琴养休伸甜歌院除息您牵困员青宁室样校切教响班欠元包钟叹哈迟闹及身仔细次外计怦礼加夕与川州台争民族亿洁欢祖旗帜庆曲央交市旁优阴坛城国图申匹互京泪洋拥抱相扬讲打指接惊故侯奇寸落补拔功助取所信沿拾际蛙错答还言每治棵挂哇怪慢怎么思穿弯比服浅漂啦啊夫表示号汗伤吸极串免告诉狐狸猴颗斤折挑根独满容易采背板椅但傍清消由术吐注课铅笔桌景拿坏松扎抓祝福句幸之令布直当第现期轮路丑永饥饱温贫富户亚角周床病始张寻哭良食双体操场份粉昨晴姑娘妹读舟乘音客何汪丛牢拍护保物鸡猫羽领捉理跃蹦灵晨失觉扔掉眼睛纸船久乎至死腰捡粒被并夜喜重味轻刻群卫运宇宙航舰冲晒池浮灾害黑器岸纹洞影倒游圆围杯件住须能飘必事历史灭克化代孙植厂产介农科技纺织'),
('grade-2-2', '二年级下册', '诗村童碧妆绿丝剪冲寻姑娘吐柳荡桃杏鲜邮递员原叔局堆礼邓植格引注满休息锋昨冒留弯背洒温暖能桌味买具甘甜菜劳匹妹波纹像景恋舍求州湾岛峡民族谊齐奋贴街舟艾敬转团热闹贝壳甲骨钱币与财关烧茄烤鸭肉鸡蛋炒饭彩梦森拉结苹般精灵伞姨弟便教游戏母周围句补充药合死记屁股尿净屎幸使劲亡牢钻劝丢告筋疲图课摆座交哈哈页抢嘻愿意麦该伯刻突掉湖莲穷荷绝含岭吴雷乌黑压垂户迎扑指针帮助导永碰特积宇宙杯失板容易浴室扇慢遇兔安根痛最店决定商夫终完换期蛙卖搬倒籽泉破应整抽纺织编怎布消祖啊浓望蓝摘掏赛忆世界功反复式简弄由觉值类艰弓炎害此新'),
('grade-3-1', '三年级上册', '坪坝戴招蝴蝶孔雀舞铜粗尾要装劲绒朝些钓察瓣拢掌趣爬峰顶似苍仰咱奋辫勇居郊散步胸脯渣或者敢惜低诚基突按摆弄准备侧胶卷辆秘杂社著藏悄闪坑臣推旅考秦纪遗究震促深忆异逢佳倍遥遍插精希却依拼命奔村抖丧磨坊扇枚邮爽柿仙梨菠萝粮紧杨艳内梦醒苏湿娇嫩强适昆播修致论试验袋证概减阻测括确误途超堂镜闲待阅腿随调简拜访具闻尘仆纳闷丘迎等止境授品暗降丈肢肌肤辽阔血液滋润创造县设参部横跨举击坚固栏案爪贵断楚孤帆蓝懒披划威武拣颜形状渔料辈汇欣赏映挡视线浸献药材软刮舌矛盾集持般架龟攻炮坦战神兵退挖鞋斧锯免屋抢难初管敌阶懂陶谦虚嘴恼怒吵感荒捧朴素值受愿姿势投况吞烈绪述普通鼓励育瓶系绳茶危险顺俩索激堵获予担宽裕买猜糖即卡盼仁贴'),
('grade-3-2', '三年级下册', '燕聚增掠稻尖偶沾圈漾倦符演赞咏碧妆裁剪滨紫荷挨莲蓬账仿佛裳翩蹈蜻蜓翠秆腹赤衬衫透泛泡饲翁陡壁欧洲瑞士舒启殊骤涉疲政踏救载森郁葱湛盖犁砍裸扩栋柴喘黎寓则窟窿狼叼街劝悔盘缠硬弓魏射箭猎雁弦悲惨愈痛裂叮嘱排靠幅审肃晌悦熟悉诲赛疼忧慰梭虽狂赢暑益穷将若俱博鸦截伍默局棒羡慕禁席众纠匠替抄墨骂缩承肩扛缘愤毕戒既贺顾迅速复恰犯缓婆议达稚烦享炸医输眉型否垫酒掩咬拳制柔渴罐累竟匆哀舔反递忍凑咽唾沫涌差抵氏庄稼兽存繁殖蔬麻较杀预幕临悬曾奥努登任撒藻旦项估龄络箱迫悟盯鼠唐警眯览敞寄秒恋彤霞陪趁窄脖段漆胆踪镇摊鼻忧换摔竖卖售驮构端掏馆饭辨堆模付标齿乞巧霄渡屏烛晓偷淹官逼姓睁旱徒腾催吊跪渠灌溉隆塌露燃熊挣熄喷缺纯冶炼盆'),
('grade-4-1', '四年级上册', '潮称盐笼罩蒙薄雾昂沸贯旧恢灿烂竿茫桨规律支株缝隙耀梢寂莫腊浑疑虎占铺均匀叠茎柄触痕逐宅蔽弃毫遇择址穴掘搜倾扒抛溢允墙牌添训覆凝辣酷愉拆融剩伐煤颈郑厉剧餐倘饮侍脾蹲供邻性格凭贪职痒稿踩梅蛇跌撞辟崇旋嘉砖隔屯堡垒仗扶智慧魄殿廊柱栽筑阁朱堤雕狮态孟浩陵辞唯舍君洪暴猛涨裤懒稳俗衡序伏峡桂移湾彼袭余怀旷暂胞脉帝义伯租振范闯凡巡嚷妇惩篇荐翻帘页删词燥握洽昏厅糊改程赖耕驾幻潜核控联哲归恐凶笨鸽仅顿描绘吨盈敏捷崭'),
('grade-4-2', '四年级下册', '亭庭潭螺谙澜瑕攀峦泰骆驼罗障兀绵浙桐簇浓臀稍额擦蜿蜒乳据源维财属货驰赠驶德惑码库捎橡拨尊沃呈惫堪善款例瘦杰喉捶僵配幼滩侦嘲啄企愚蠢返拦鸥帽吁彻蝙蝠捕蛾蚊避锐铛蝇揭碍荧削喂哨挺斯甩踢枪防鬼汉滚毁惯牺牲凯征阿姨济贡圣驻罪恶健康径畅磕绊瞬弧翔权缤扰欲屈茁诊撼蹋限棚饰冠菊瞧率觅耸捣搬巢谐眠辛蚕桑昼耕绩塞鹭笠略辩奉违磅拴拖释宣萨妄执港澈壶缸罢苟绣挥徽聋哑昌妻刺绑扁鹊蔡睬肠胃烫剂汤焰驱袖败罚佩饶抗押锁狠膝肝脏'),
('grade-5-1', '五年级上册', '窃炒锅踮哟饿惧充檐皱碗酸撑柜侣娱盒豫趟诵零编某洛榆畔帐魂缕幽葬愁腮甚绸呜谓梳衰绢侨鲸猪腭哺滤肚肺矮判胎盗嫌夹恙藕粘噪废捞饵溅钩翼纵啪鳃皎唇沮诱诫践亩尝吩咐茅榨榴杉矶混昔墟曼疾爆砾砸颤糕迪搂豪誊置司妙版慈祥歧谨慎损皇珑剔杭莱瑶宏宋侵统销瑰烬庙务葛吼腔崎岖尸斩坠雹仇恨眺丸崖岷典副委协宾泽奏诞钮瞻拂骑嗓党'),
('grade-5-2', '五年级下册', '毯渲勒吟迂襟蹄貌拘羞涩跤偏涯晰伞抚绍疆陷牧蓑遮醉媚锄剥毡卸咀嚼漠寞袄袍傻胚祸患臂赋淘妨岂痴绞汁厘愧亏梁惠诣乃曰禽侮辱谎敝矩囚嘻臣淮柑橘枳贼赔妮役硝炭谊谣噩耗跺嫂挎篮咆哮疯狞淌肆揪豹瞪呻膛搀祭奠赵璧召诺怯瑟拒诸荆妒忌曹督甘鲁延幔私寨擂呐援丞擞绽扳咚监侄郎皆敛媳骚宗怜帕脊莞锦姹嫣暇颇尼艇叉艄翘舱姆祷雇哗'),
('grade-6-1', '六年级上册', '邀俯瀑峭躯津蕴侠谧巷俏逗庞烘烤韵勤勉吻施挠庸艰毅铲劣惹讥浆岔挚寝频朦胧凄斑篇搁填怨掀唉裹魁梧淋撕霉虑悠仪歉溜嘿割晶莹蔼资矿赐竭滥胁睹嗡鹿骏鹰潺脂婴眷扭胯厨套猬畜窜挽囫囵枣搞恍霜详逝章咳嗽塑饼谱抑挫歇吉营劈寇蕉筒躁革遭泣浴搏碑茵蜡陌盲键粼霎录'),
('grade-6-2', '六年级下册', '挪蒸秧萎番锻雅勃旬熬蒜醋饺翡拌榛栗筝鞭麦寺逛籍屉怖瞅魔胖刑哼峻残匪窝啃舅鸿鼎旺炊乖裙兜币哎橱锈摩揉玛蘸毒撇噎搓匣喳吭娜伊搅埃伦藤析碱顽卓效蚀乏誉衔粪捐澡械逆玫域');

insert into public.app_config (key, value) values
('default_text', '一二三四五六七八九十上下左右大小多少土个入人儿火文木禾无口日月天中了子门不开目耳头米见白田电也长山出飞马鸟云公车牛羊巾牙尺毛卜又心风力手水广升足走方半巴业本平书自已东西回片皮生里果几用鱼今正雨两瓜衣来年万百丁齐冬说友话春朋高你绿们花红草爷亲节的岁行古处声知忙洗真认父扫母爸写全完关家看笑着兴画会妈合奶放午收女气太早去亮和李语秀千香听远唱定连向以更后意主总先起干明赶净同专工才级队蚂蚁前房空网诗黄林闭童立是我朵叶美机她过他时送让吗往吧得虫很河借姐呢呀哪谁凉怕量跟最园脸因阳为光可法石找办许别那到都吓叫再做象点像照沙海桥军竹苗井乡面忘想念王这从进边道贝男原爱虾跑吹乐地老快师短淡对热冷情拉活把种给吃练学习非苦常问伴间共伙汽分要没孩位选北湖南秋江只帮星请雪就球跳玩桃树刚兰座各带坐急名发成动晚新有么在变什条');

-- =====================================================================
-- 管理员账号创建（一次性步骤，也可在控制台操作）：
--   1) 控制台 Authentication -> Users -> Add user 创建管理员邮箱（如 admin@hanzi.local）和密码；
--   2) 注册触发器会自动生成一条 role=student 的 profile；
--   3) 在 SQL Editor 执行下面语句把它提升为管理员：
--      update public.profiles
--      set name = '管理员', role = 'admin'
--      where id = (select id from auth.users where email = 'admin@hanzi.local');
--   建议：控制台 Authentication -> Providers -> Email 关闭 "Confirm email"，方便学生直接注册即用。
-- =====================================================================