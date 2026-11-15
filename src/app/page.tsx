// Landing — 디자인 규정집 제2판.
// 완전 정적 (1시간 revalidate). 인증된 사용자가 방문해도 랜딩을 보고,
// 상단 로그인 버튼 클릭 시 /login 이 이미 로그인된 사용자를 /app 으로 자동 이동시킴.
// 문서 카운트는 DB 실측치를 ISR 로 얹는다 — 과장 카피("4만여 개")로 신뢰 잃지 않도록.

import Link from "next/link";
import { FragmentIllustration } from "@/components/FragmentIllustration";
import { BrandLockup } from "@/components/BrandMark";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600;

// 랜딩에 노출할 문서 총량. groupBy 로 종류별까지 쪼개면 스키마 종속이 커져
// 유지비만 늘어난다. LegalSource 별 (LAW / ADMIN_RULE) 카운트는
// legalSourceId 그룹핑 + 소스 조회 두 단계라 여기선 총량만 실측한다.
async function getCorpusCaption(): Promise<string> {
  try {
    const total = await prisma.legalDocument.count();
    if (total === 0) {
      return "법령 · 행정규칙 자동 수집 중 · 공포 즉시 조문 단위 대조";
    }
    return `수집 문서 ${total.toLocaleString()}건 · 공포 즉시 조문 단위 대조`;
  } catch (err) {
    // DB 실패 시 랜딩이 죽지 않도록 안전한 기본 카피로 폴백.
    console.warn("[landing] corpus count failed", (err as Error).message);
    return "법령 · 행정규칙 자동 수집 · 공포 즉시 조문 단위 대조";
  }
}

export default async function RootPage() {
  const caption = await getCorpusCaption();
  return (
    <main className="min-h-screen bg-canvas">
      <Header />
      <div className="mx-auto max-w-content px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        <Hero caption={caption} />
        <Steps />
        <Features />
        <FinalCta />
      </div>
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-header max-w-content items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="LawChange 홈">
          <BrandLockup />
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/laws" className="text-sm text-fg-secondary hover:text-fg">
            법령 검색
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover"
          >
            로그인
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero({ caption }: { caption: string }) {
  return (
    <section className="grid grid-cols-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:py-16">
      <div>
        <p className="mb-5 text-sm text-fg-muted">
          한국 법령 변경 추적 · Regulatory Intelligence
        </p>
        {/* 랜딩 표제는 법령의 목소리(명조). 아래 설명·버튼은 도구(고딕). */}
        <h1 className="font-legal text-4xl font-bold leading-[1.35] tracking-title text-fg">
          조문 단위로
          <br />
          바뀌는 법,
          <br />
          <span className="text-primary-text">업무로 만드는 힘.</span>
        </h1>
        <p className="mt-6 max-w-[460px] text-base leading-relaxed text-fg-secondary">
          법령 변경을 조문 단위로 추적하고, 조직의 영향과 업무로 연결합니다.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover"
          >
            시작하기
          </Link>
          <Link
            href="/laws/changes"
            className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-6 text-base font-medium text-fg transition-colors duration-swift hover:bg-hover"
          >
            최근 개정 보기
          </Link>
        </div>
        <p className="mt-4 text-sm text-fg-muted">{caption}</p>
      </div>

      {/* 조각 일러스트 — 3D 라이브러리 없이 정적 SVG. 장식이 아니라
          "법령 = 조문 조각의 구조체, 바뀐 조각이 검토로 떠오른다" 는 제품 논리. */}
      <div className="flex justify-center lg:justify-end">
        <FragmentIllustration className="h-auto w-full max-w-[380px]" />
      </div>
    </section>
  );
}

function Steps() {
  const steps = [
    { num: "첫째", title: "관심 법령 등록", desc: "우리 업무에 걸리는 법령을 골라 둡니다" },
    { num: "둘째", title: "자동 개정 감지", desc: "공포 즉시 조문 단위로 대조합니다" },
    { num: "셋째", title: "우리 조직 판단", desc: "적용 여부와 영향 범위를 기록합니다" },
    { num: "넷째", title: "조치와 증빙 관리", desc: "누가 언제 무엇을 했는지 남깁니다" },
  ];
  return (
    <section className="grid grid-cols-1 border-b border-line sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <div
          key={s.title}
          className={`p-7 lg:px-6 lg:py-8 ${
            i < steps.length - 1 ? "border-b border-line lg:border-b-0 lg:border-r" : ""
          }`}
        >
          <div className="mb-2.5 text-xs text-fg-muted">{s.num}</div>
          <h3 className="text-base font-semibold text-fg">{s.title}</h3>
          <p className="mt-2 text-sm text-fg-secondary">{s.desc}</p>
        </div>
      ))}
    </section>
  );
}

function Features() {
  const features = [
    {
      title: "정확한 신·구 조문 비교",
      desc: "조문 단위로 무엇이 신설·수정·삭제·이동됐는지 표시합니다. 부칙만 개정된 경우도 구분합니다.",
    },
    {
      title: "관심 법령",
      desc: "우리 조직이 관리하는 법령 목록. 담당 부서·담당자·중요도·검토 주기를 관리합니다.",
    },
    {
      title: "변경 알림 처리 대기",
      desc: "감지된 개정을 검토 필요 → 조치 → 완료로 흐름 관리. 상태별 필터를 지원합니다.",
    },
    {
      title: "업무와 증빙",
      desc: "필요한 조치를 업무로 만들고 링크·파일·설명을 증빙으로 남겨 감사에 대비합니다.",
    },
    {
      title: "내부 사규 연결",
      desc: "법령을 사내 규정·SOP·개인정보처리방침에 연결해 영향 범위를 즉시 확인합니다.",
    },
    {
      title: "규제 캘린더와 내려받기",
      desc: "검토 예정·시행일·업무 마감을 월 단위로 확인. 표 형식으로 내려받아 보고서로 씁니다.",
    },
  ];
  return (
    <section className="border-b border-line px-8 py-16 lg:px-10">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[184px_1fr] lg:gap-12">
        <div>
          <div className="text-2xl font-semibold tracking-title text-fg">
            기능
          </div>
          <p className="mt-4 text-xs text-fg-muted">
            법령을 읽는 것이 아니라, 대응합니다.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="border-t border-line pt-4">
              <h3 className="text-xl font-semibold text-fg">{f.title}</h3>
              <p className="mt-2.5 text-base text-fg-secondary">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-8 py-16 lg:px-10">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[184px_1fr] lg:gap-12">
        <div>
          <div className="text-2xl font-semibold tracking-title text-fg">
            시작
          </div>
        </div>
        <div className="border border-line bg-surface px-8 py-9">
          <h2 className="text-3xl font-semibold tracking-title text-fg">
            직접 써 보기
          </h2>
          <p className="mt-3 max-w-[520px] text-base text-fg-secondary">
            관심 법령 하나만 등록해두면, 다음 개정부터는 스스로 찾지 않아도 됩니다.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex bg-primary px-6 py-3 text-base font-semibold text-primary-fg hover:bg-primary-hover transition-colors"
          >
            로그인하고 관심 법령 등록하기
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-[420px]">
            <BrandLockup markSize={20} />
            <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
              법령 변경을 조문 단위로 추적하고, 조직의 영향과 업무로 연결합니다.
            </p>
            {/* 데이터 출처를 밝히는 건 법무 담당자에게 신뢰 신호다.
                "이 숫자가 어디서 왔는가" 에 답하지 못하면 도구를 못 믿는다. */}
            <p className="mt-4 text-xs leading-relaxed text-fg-muted">
              법령 원문은 법제처 국가법령정보센터 공개 API 에서 수집합니다.
              이 앱은 법률 자문을 제공하지 않으며, 최종 판단은 원문을
              확인해 주세요.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-12 gap-y-6 text-sm">
            <FooterGroup title="서비스">
              <FooterLink href="/laws">법령 찾기</FooterLink>
              <FooterLink href="/laws/changes">최근 개정</FooterLink>
              <FooterLink href="/laws/industries">산업별</FooterLink>
            </FooterGroup>
            <FooterGroup title="이용">
              <FooterLink href="/login">로그인</FooterLink>
              <FooterLink href="https://www.law.go.kr" external>
                법제처 원문
              </FooterLink>
            </FooterGroup>
          </div>
        </div>

        <div className="mt-8 border-t border-line pt-5 text-xs text-fg-muted">
          LawChange
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2.5 text-xs font-medium text-fg-muted">{title}</p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      {external ? (
        <a
          href={href}
          target="_blank"
          rel="noopener external"
          className="text-fg-secondary hover:text-primary-text"
        >
          {children}
        </a>
      ) : (
        <Link href={href} className="text-fg-secondary hover:text-primary-text">
          {children}
        </Link>
      )}
    </li>
  );
}
