import huddleVideoFallback from "@/assets/huddle video fallback.png";
import huddleVideo from "@/assets/huddle video.mp4";

const SignupContinueInApp = () => (
  <main className="min-h-svh bg-white flex items-center justify-center px-6 py-10">
    <section className="w-full max-w-[360px] flex flex-col items-center text-center">
      <div className="relative w-[180px] h-[148px] overflow-hidden bg-white">
        <img
          alt="Huddle"
          className="absolute inset-0 m-auto h-[180px] w-[180px] object-contain"
          src={huddleVideoFallback}
        />
        <video
          aria-hidden="true"
          autoPlay
          className="absolute inset-0 m-auto h-[180px] w-[180px] object-contain"
          loop
          muted
          playsInline
          poster={huddleVideoFallback}
          src={huddleVideo}
        />
      </div>
      <h1 className="mt-12 text-[28px] font-extrabold leading-tight text-[#424965]">
        Continue sign-up in the app
      </h1>
      <p className="mt-3 text-[16px] font-medium leading-relaxed text-[#8c91a7]">
        This link is confirmed. Open huddle on your phone to finish setting up your account.
      </p>
    </section>
  </main>
);

export default SignupContinueInApp;
